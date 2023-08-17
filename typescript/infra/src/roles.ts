export enum Role {
  Validator = 'validator',
  Relayer = 'relayer',
  Scraper = 'scraper',
  Deployer = 'deployer',
  Bank = 'bank',
  Kathy = 'kathy',
}

export const ALL_KEY_ROLES = [
  Role.Validator,
  Role.Relayer,
  Role.Deployer,
  Role.Bank,
  Role.Kathy,
];

// Use a const assertion to tell the compiler to retain the literal array item types.
export const ALL_AGENT_ROLES = [
  Role.Validator,
  Role.Relayer,
  Role.Scraper,
] as const;
export type ALL_AGENT_ROLES = typeof ALL_AGENT_ROLES[number];
export type AgentChainNames = Record<ALL_AGENT_ROLES, string[]>;
