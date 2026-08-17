import {delimiter} from 'node:path';

const packageName = 'evolf-cli';
const commandName = 'evolf';
const isGlobalInstall = process.env.npm_config_global === 'true';
const userAgent = process.env.npm_config_user_agent ?? '';
const isPnpm = userAgent.includes('pnpm');
const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
const npmPrefix = process.env.npm_config_prefix;
const pnpmHome = process.env.PNPM_HOME;
const localBinPath = `${process.env.HOME ?? '~'}/.local/bin`;

function print(lines) {
  process.stdout.write(`\n${lines.join('\n')}\n\n`);
}

if (!isGlobalInstall) {
  print([
    `Installed ${packageName}.`,
    '',
    `Run instantly with: npx ${packageName}`,
    `Alternative: pnpm dlx ${packageName}`,
    '',
    `To install the '${commandName}' terminal command on Linux:`,
    `  npm config set prefix ${localBinPath.replace(/\/bin$/, '')}`,
    `  export PATH="${localBinPath}:$PATH"`,
    `  npm install -g ${packageName}`,
    `  ${commandName}`
  ]);

  process.exit(0);
}

if (isPnpm) {
  const hasPnpmHome = pnpmHome ? pathEntries.includes(pnpmHome) : false;

  print([
    `Installed ${packageName} globally with pnpm.`,
    '',
    hasPnpmHome
      ? `Run it with: ${commandName}`
      : 'Your pnpm global bin directory may not be on PATH.',
    ...(
      hasPnpmHome
        ? []
        : [
            'If the command is not found, run:',
            '  pnpm setup',
            'Then restart your shell and run:',
            `  ${commandName}`
          ]
    )
  ]);

  process.exit(0);
}

const hasLocalBin = pathEntries.includes(localBinPath);
const isUserLocalPrefix = npmPrefix === `${process.env.HOME ?? '~'}/.local`;

print([
  `Installed ${packageName}.`,
  '',
  isUserLocalPrefix && hasLocalBin
    ? `Run it with: ${commandName}`
    : `To make the '${commandName}' terminal command work on Linux, use a user-local npm prefix:`,
  ...(
    isUserLocalPrefix && hasLocalBin
      ? []
      : [
          `  npm config set prefix ${localBinPath.replace(/\/bin$/, '')}`,
          `  export PATH="${localBinPath}:$PATH"`,
          `  npm install -g ${packageName}`,
          `  ${commandName}`
        ]
  )
]);
