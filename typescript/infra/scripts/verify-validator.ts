import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import yargs from 'yargs';

const MAX_MISSING_CHECKPOINTS = 10;

interface Checkpoint {
  checkpoint: {
    outbox_domain: number;
    root: string;
    index: number;
  };
  signature: {
    r: string;
    s: string;
    v: number;
  };
}

function isCheckpoint(obj: unknown): obj is Checkpoint {
  const c = obj as Partial<Checkpoint>;
  return (
    typeof obj == 'object' &&
    obj != null &&
    'checkpoint' in obj &&
    Number.isSafeInteger(c.checkpoint?.outbox_domain) &&
    Number.isSafeInteger(c.checkpoint?.index) &&
    isValidHashStr(c.checkpoint?.root ?? '') &&
    'signature' in obj &&
    isValidHashStr(c.signature?.r ?? '') &&
    isValidHashStr(c.signature?.s ?? '') &&
    Number.isSafeInteger(c.signature?.v)
  );
}

function isValidHashStr(s: string): boolean {
  return !!s.match(/^0x[0-9a-f]{1,64}$/im);
}

function getArgs() {
  return yargs(process.argv.slice(2))
    .alias('a', 'address')
    .describe('a', 'address of the validator to inspect')
    .demandOption('a')
    .string('a')
    .alias('p', 'prospective')
    .describe('p', 'S3 bucket of the prospective validator')
    .demandOption('p')
    .string('p')
    .alias('c', 'control')
    .describe('c', 'S3 bucket of the the known (control) validator')
    .demandOption('c')
    .string('c').argv;
}

class S3Wrapper {
  private readonly client: S3Client;
  readonly region: string;
  readonly bucket: string;

  constructor(bucketUrl: string) {
    const match = bucketUrl.match(
      /^(?:https?:\/\/)?(.*)\.s3\.(.*)\.amazonaws.com\/?$/,
    );
    if (!match) throw new Error('Could not parse bucket url');
    this.bucket = match[1];
    this.region = match[2];
    this.client = new S3Client({ region: this.region });
  }

  async getS3Obj<T = unknown>(
    key: string,
  ): Promise<{ obj: T; modified: Date }> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!response.Body) {
      throw new Error('No data received');
    }
    const bodyStream: NodeJS.ReadableStream =
      'stream' in response.Body
        ? response.Body.stream()
        : (response.Body as NodeJS.ReadableStream);

    const body: string = await streamToString(bodyStream);
    return {
      obj: JSON.parse(body),
      modified: response.LastModified!,
    };
  }
}

async function main() {
  const {
    a: _validatorAddress,
    p: prospectiveBucket,
    c: controlBucket,
  } = await getArgs();

  const cClient = new S3Wrapper(controlBucket);
  const pClient = new S3Wrapper(prospectiveBucket);

  const [{ obj: cLatestCheckpoint }, { obj: pLastCheckpoint }] =
    await Promise.all([
      cClient.getS3Obj<number>('checkpoint_latest_index.json').catch((err) => {
        console.error(
          "Failed to get control validator's latest checkpoint.",
          err,
        );
        process.exit(1);
      }),
      pClient.getS3Obj<number>('checkpoint_latest_index.json').catch((err) => {
        console.error(
          "Failed to get prospective validator's latest checkpoint.",
          err,
        );
        process.exit(1);
      }),
    ]);

  console.assert(
    Number.isSafeInteger(cLatestCheckpoint),
    'Expected latest control checkpoint to be an integer',
  );
  console.assert(
    Number.isSafeInteger(pLastCheckpoint),
    'Expected latest prospective checkpoint to be an integer',
  );

  console.log(`Latest Index`);
  console.log(`control: ${cLatestCheckpoint}`);
  console.log(`prospective: ${pLastCheckpoint}\n`);

  let extraCheckpoints = [];
  const missingCheckpoints = [];
  let invalidCheckpoints = [];
  const modTimeDeltasS = [];
  const fullyCorrectCheckpoints = [];
  let missingInARow = 0;
  let lastNonMissingCheckpointIndex = Infinity;
  for (let i = Math.max(cLatestCheckpoint, pLastCheckpoint); i >= 0; --i) {
    if (missingInARow == MAX_MISSING_CHECKPOINTS) {
      missingCheckpoints.length -= MAX_MISSING_CHECKPOINTS;
      invalidCheckpoints = invalidCheckpoints.filter(
        (j) => j < lastNonMissingCheckpointIndex,
      );
      extraCheckpoints = extraCheckpoints.filter(
        (j) => j < lastNonMissingCheckpointIndex,
      );
      break;
    }

    const key = `checkpoint_${i}.json`;

    let c: Checkpoint | null;
    let cLastMod: Date | null;
    try {
      const t = await cClient.getS3Obj(key);
      if (isCheckpoint(t.obj)) {
        if (t.obj.checkpoint.index != i) {
          console.log(`${i}: Control index is invalid`, t);
          process.exit(1);
        }
        [c, cLastMod] = [t.obj, t.modified];
      } else {
        console.log(`${i}: Invalid control checkpoint`, t);
        process.exit(1);
      }
    } catch (err) {
      c = cLastMod = null;
    }

    let p: Checkpoint;
    let pLastMod: Date;
    try {
      const t = await pClient.getS3Obj(key);
      if (isCheckpoint(t.obj)) {
        [p, pLastMod] = [t.obj, t.modified];
        lastNonMissingCheckpointIndex = i;
      } else {
        console.log(`${i}: Invalid prospective checkpoint`, t.obj);
        invalidCheckpoints.push(i);
        continue;
      }
      if (!c) {
        extraCheckpoints.push(i);
      }
      missingInARow = 0;
    } catch (err) {
      if (c) {
        missingCheckpoints.push(i);
        missingInARow++;
      }
      continue;
    }

    console.assert(
      p.checkpoint.index == i,
      `${i}: checkpoint indexes do not match`,
    );

    // TODO: verify signature

    if (!c) {
      continue;
    }

    // compare against the control
    console.assert(
      c.checkpoint.outbox_domain == p.checkpoint.outbox_domain,
      `${i}: outbox_domains do not match`,
    );
    console.assert(
      c.checkpoint.root == p.checkpoint.root,
      `${i}: checkpoint roots do not match`,
    );

    try {
      const diffS = (pLastMod.valueOf() - cLastMod!.valueOf()) / 1000;
      if (Math.abs(diffS) > 10) {
        console.log(`${i}: Modification times differ by ${diffS}s`);
      }
      modTimeDeltasS.push(diffS);
    } catch (err) {
      // this is probably a permission error since we already know they should exist
      console.error(`${i}: Error validating last modified times`, err);
    }

    fullyCorrectCheckpoints.push(i);
  }

  if (fullyCorrectCheckpoints.length)
    console.log(
      `Fully correct checkpoints (${fullyCorrectCheckpoints.length}): ${fullyCorrectCheckpoints}\n`,
    );
  if (extraCheckpoints.length)
    console.log(
      `Extra checkpoints (${extraCheckpoints.length}): ${extraCheckpoints}\n`,
    );
  if (missingCheckpoints.length)
    console.log(
      `Missing checkpoints (${missingCheckpoints.length}): ${missingCheckpoints}\n`,
    );
  if (invalidCheckpoints.length)
    console.log(
      `Invalid checkpoints (${invalidCheckpoints.length}): ${invalidCheckpoints}\n`,
    );

  if (modTimeDeltasS.length > 1) {
    // Drop the time of the first one since it is probably way off
    modTimeDeltasS.length--;
    console.log(
      `Time deltas (∆ < 0 -> prospective came earlier than the control)`,
    );
    console.log(modTimeDeltasS);
    console.log(`Median: ${median(modTimeDeltasS)}s`);
    console.log(`Mean:   ${mean(modTimeDeltasS)}s`);
    console.log(`Stdev:  ${stdDev(modTimeDeltasS)}s`);
  }
}

function median(a: number[]): number {
  a = [...a]; // clone
  a.sort((a, b) => a - b);
  if (a.length <= 0) {
    return 0;
  } else if (a.length % 2 == 0) {
    return (a[a.length / 2] + a[a.length / 2 - 1]) / 2;
  } else {
    return a[(a.length - 1) / 2];
  }
}

function mean(a: number[]): number {
  return a.reduce((acc, i) => acc + i, 0) / a.length;
}

function stdDev(a: number[]): number {
  return Math.sqrt(
    a.map((i) => i * i).reduce((acc, i) => acc + i, 0) / a.length,
  );
}

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    stream
      .setEncoding('utf8')
      .on('data', (chunk) => chunks.push(chunk))
      .on('error', (err) => reject(err))
      .on('end', () => resolve(String.prototype.concat(...chunks)));
  });
}

main().catch(console.error);
