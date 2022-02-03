import * as celo from '../../config/mainnets/celo';
import * as ethereum from '../../config/mainnets/ethereum';
import * as polygon from '../../config/mainnets/polygon';
import * as avalanche from '../../config/mainnets/avalanche';

const configDirectory = 'prod';
export const configPath = `../../rust/config/${configDirectory}`;
export const networks = [celo, polygon, avalanche, ethereum];
