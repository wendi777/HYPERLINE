import { ChainName } from '@abacus-network/sdk';
import {
  IAMClient,
  CreateAccessKeyCommand,
  CreateUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-iam';
import { KEY_ROLE_ENUM } from '../../agents';
import { gcpSecretExists, setGCPSecret } from '../../utils/gcloud';

export class AgentAwsUser<Networks extends ChainName> {
  private adminIamClient: IAMClient;

  private _arn: string | undefined;

  constructor(
    public readonly environment: string,
    public readonly chainName: Networks,
    public readonly region: string,
  ) {
    this.adminIamClient = new IAMClient({ region });
  }

  // Creates the AWS user if it doesn't exist.
  // Gets API access keys and saves them in GCP secret manager if they do not already exist.
  // Populates `this._arn` with the ARN of the user.
  async createIfNotExists() {
    const cmd = new ListUsersCommand({});
    const result = await this.adminIamClient.send(cmd);
    const match = result.Users?.find((user) => user.UserName === this.userName);
    if (match) {
      this._arn = match?.Arn;
    } else {
      this._arn = await this.create();
    }
    if (!(await this.accessKeysExist())) {
      await this.createAndSaveAccessKey();
    }
  }

  // Creates the AWS user
  async create() {
    const cmd = new CreateUserCommand({
      UserName: this.userName,
      Tags: this.awsTags,
    });
    const response = await this.adminIamClient.send(cmd);
    if (!response.User) {
      throw Error('Expected User');
    }
    return response.User.Arn;
  }

  async accessKeysExist(): Promise<boolean> {
    const accessKeyIdExists = await gcpSecretExists(this.accessKeyIdSecretName);
    const secretAccessKeyExists = await gcpSecretExists(
      this.secretAccessKeySecretName,
    );
    return accessKeyIdExists && secretAccessKeyExists;
  }

  async createAndSaveAccessKey() {
    const cmd = new CreateAccessKeyCommand({
      UserName: this.userName,
    });
    const { AccessKey: accessKey } = await this.adminIamClient.send(cmd);
    if (!accessKey || !accessKey.AccessKeyId || !accessKey.SecretAccessKey) {
      throw Error('Expected fully defined access key');
    }
    await setGCPSecret(
      this.accessKeyIdSecretName,
      accessKey.AccessKeyId,
      this.tags,
    );
    await setGCPSecret(
      this.secretAccessKeySecretName,
      accessKey.SecretAccessKey,
      this.tags,
    );
  }

  get awsTags() {
    const tags = this.tags;
    return Object.keys(tags).map((key) => ({
      Key: key,
      Value: tags[key],
    }));
  }

  get tags(): Record<string, string> {
    return {
      environment: this.environment,
      role: this.role,
      chain: this.chainName,
    };
  }

  get role() {
    return KEY_ROLE_ENUM.Relayer;
  }

  get userName() {
    return `abacus-${this.environment}-${this.chainName}-${this.role}`;
  }

  get accessKeyIdSecretName() {
    return `${this.userName}-aws-access-key-id`;
  }

  get secretAccessKeySecretName() {
    return `${this.userName}-aws-secret-access-key`;
  }

  get arn(): string {
    if (!this._arn) {
      throw Error('ARN is undefined');
    }
    return this._arn;
  }
}
