#!/usr/bin/env node

import React, {useState} from 'react';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Box, Text, render, useApp, useInput, useStdin} from 'ink';

const MODES = ['off', 'static', 'slow', 'fast'] as const;
const TITLE_LINES = [
  '███████ ██    ██  ██████  ███████',
  '██      ██    ██ ██    ██ ██',
  '█████   ██    ██ ██    ██ █████',
  '██       ██  ██  ██    ██ ██',
  '███████   ████    ██████  ██'
];
const INITIAL_STATUS = 'Idle. Pick a mode and press Enter.';
const DEVICE_MODE_MESSAGE = 'No read-back HID report exists yet, so live sync is unavailable.';
const PACKAGE_LABEL = 'evofox terminal ui';

type Mode = (typeof MODES)[number];

type CliOptions = {
  vid?: string;
  pid?: string;
  mode?: Mode;
  showHelp: boolean;
  showVersion: boolean;
};

type SendModeResult = {
  ok: boolean;
  message: string;
};

type PanelProps = {
  title: string;
  children: React.ReactNode;
};

type ModeButtonProps = {
  mode: Mode;
  isSelected: boolean;
  isLastSent: boolean;
};

type KeyboardHandlerProps = {
  onMovePrevious: () => void;
  onMoveNext: () => void;
  onSendMode: () => void;
  onQuit: () => void;
};

type StatusPanelProps = {
  lastSentMode: Mode | null;
  statusMessage: string;
  selectedDeviceLabel: string;
};

type SessionPanelProps = {
  isInteractive: boolean;
  selectedDeviceLabel: string;
};

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = dirname(currentFilePath);
const packageRoot = resolve(currentDirectory, '..');
const packageJsonPath = resolve(packageRoot, 'package.json');
const pythonScriptPath = resolve(packageRoot, 'evofox-phantom.py');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {name?: string; version?: string};
const packageName = packageJson.name ?? 'evofox';
const packageVersion = packageJson.version ?? '0.0.0';

function isMode(value: string): value is Mode {
  return MODES.includes(value as Mode);
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    showHelp: false,
    showVersion: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--help' || current === '-h') {
      options.showHelp = true;
      continue;
    }

    if (current === '--version' || current === '-v') {
      options.showVersion = true;
      continue;
    }

    if ((current === '--vid' || current === '--pid' || current === '--mode' || current === '--led' || current === '-l') && !next) {
      throw new Error(`Missing value for ${current}`);
    }

    if (current === '--vid') {
      options.vid = next;
      index += 1;
      continue;
    }

    if (current === '--pid') {
      options.pid = next;
      index += 1;
      continue;
    }

    if (current === '--mode' || current === '--led' || current === '-l') {
      if (!isMode(next)) {
        throw new Error(`Invalid mode: ${next}`);
      }

      options.mode = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return options;
}

function printHelp() {
  process.stdout.write(`evofox\n\nUsage:\n  evofox\n  evofox --mode <off|static|slow|fast>\n  evofox --vid <hex> --pid <hex>\n\nOptions:\n  --vid <hex>     Override USB vendor ID\n  --pid <hex>     Override USB product ID\n  --mode <mode>   Send a mode without opening the TUI\n  --led <mode>    Alias for --mode\n  -l <mode>       Alias for --mode\n  -h, --help      Show this help message\n  -v, --version   Show package version\n\nPackage:\n  ${packageName}@${packageVersion}\n`);
}

function printVersion() {
  process.stdout.write(`${packageVersion}\n`);
}

function getPreviousIndex(currentIndex: number) {
  return currentIndex === 0 ? MODES.length - 1 : currentIndex - 1;
}

function getNextIndex(currentIndex: number) {
  return currentIndex === MODES.length - 1 ? 0 : currentIndex + 1;
}

function buildPythonArgs(mode: Mode, options: CliOptions) {
  const pythonArgs = [pythonScriptPath, '--led', mode];

  if (options.vid) {
    pythonArgs.push('--vid', options.vid);
  }

  if (options.pid) {
    pythonArgs.push('--pid', options.pid);
  }

  return pythonArgs;
}

function sendMode(mode: Mode, options: CliOptions): SendModeResult {
  const result = spawnSync('python3', buildPythonArgs(mode, options), {
    cwd: packageRoot,
    encoding: 'utf8'
  });

  if (result.error) {
    return {
      ok: false,
      message: `Launch failed: ${result.error.message}`
    };
  }

  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const fallbackMessage = `Mode command failed with exit code ${result.status}`;

  if (result.status === 0) {
    return {
      ok: true,
      message: stdout || `Mode changed to ${mode}`
    };
  }

  return {
    ok: false,
    message: stderr || stdout || fallbackMessage
  };
}

function getSelectedDeviceLabel(options: CliOptions) {
  if (!options.vid && !options.pid) {
    return 'Auto-detecting compatible mouse';
  }

  const vendorId = options.vid ?? 'default';
  const productId = options.pid ?? 'default';

  return `VID ${vendorId} | PID ${productId}`;
}

function Panel({title, children}: PanelProps) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="cyan">{title}</Text>
      {children}
    </Box>
  );
}

function Header() {
  return (
    <Box alignSelf="center" flexDirection="column" marginBottom={1}>
      {TITLE_LINES.map(line => (
        <Text key={line} color="yellowBright">
          {line}
        </Text>
      ))}
      <Text dimColor>Retro control panel for the Evofox Phantom mouse</Text>
    </Box>
  );
}

function ModeButton({mode, isSelected, isLastSent}: ModeButtonProps) {
  const label = mode.toUpperCase().padEnd(6, ' ');
  const backgroundColor = isSelected ? 'yellow' : isLastSent ? 'cyan' : undefined;
  const textColor = isSelected || isLastSent ? 'black' : 'white';

  return (
    <Box marginRight={1} marginBottom={1}>
      <Text backgroundColor={backgroundColor} color={textColor}>
        {` ${label} `}
      </Text>
    </Box>
  );
}

function ModePanel({selectedIndex, lastSentMode}: {selectedIndex: number; lastSentMode: Mode | null}) {
  return (
    <Panel title="MODE PANEL">
      <Text color="white">Choose a lighting preset and press Enter to send it.</Text>
      <Box marginTop={1} flexWrap="wrap">
        {MODES.map((mode, index) => (
          <ModeButton
            key={mode}
            mode={mode}
            isSelected={index === selectedIndex}
            isLastSent={lastSentMode === mode}
          />
        ))}
      </Box>
      <Text dimColor>Selected mode is yellow. Last sent mode is cyan.</Text>
    </Panel>
  );
}

function StatusPanel({lastSentMode, statusMessage, selectedDeviceLabel}: StatusPanelProps) {
  return (
    <Panel title="COMMAND STATUS">
      <Text>
        Last sent: <Text color="cyanBright">{lastSentMode ?? 'none'}</Text>
      </Text>
      <Text>
        Target device: <Text color="yellow">{selectedDeviceLabel}</Text>
      </Text>
      <Text dimColor>{DEVICE_MODE_MESSAGE}</Text>
      <Box marginTop={1}>
        <Text color="magentaBright">{statusMessage}</Text>
      </Box>
    </Panel>
  );
}

function ControlsPanel() {
  return (
    <Panel title="CONTROLS">
      <Text color="greenBright">Arrow keys</Text>
      <Text dimColor>Move between mode buttons</Text>
      <Text> </Text>
      <Text color="greenBright">Enter</Text>
      <Text dimColor>Send selected mode to the mouse</Text>
      <Text> </Text>
      <Text color="greenBright">Q</Text>
      <Text dimColor>Quit the panel</Text>
    </Panel>
  );
}

function SessionPanel({isInteractive, selectedDeviceLabel}: SessionPanelProps) {
  const sessionMessage = isInteractive
    ? 'Interactive TTY detected'
    : 'Interactive controls require a TTY';

  return (
    <Panel title="SESSION">
      <Text color={isInteractive ? 'green' : 'red'}>{sessionMessage}</Text>
      <Text dimColor>{selectedDeviceLabel}</Text>
      <Text dimColor>Uses the bundled Python HID script under the hood.</Text>
    </Panel>
  );
}

function Footer() {
  return (
    <Box marginTop={1} justifyContent="space-between">
      <Text dimColor>{`${PACKAGE_LABEL} ${packageVersion}`}</Text>
      <Text dimColor>Use --help for CLI options</Text>
    </Box>
  );
}

function KeyboardHandler({onMovePrevious, onMoveNext, onSendMode, onQuit}: KeyboardHandlerProps) {
  useInput((input, key) => {
    if (key.leftArrow || key.upArrow) {
      onMovePrevious();
      return;
    }

    if (key.rightArrow || key.downArrow) {
      onMoveNext();
      return;
    }

    if (key.return) {
      onSendMode();
      return;
    }

    if (input === 'q') {
      onQuit();
    }
  });

  return null;
}

function App({options}: {options: CliOptions}) {
  const {exit} = useApp();
  const {isRawModeSupported} = useStdin();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lastSentMode, setLastSentMode] = useState<Mode | null>(options.mode ?? null);
  const [statusMessage, setStatusMessage] = useState(INITIAL_STATUS);
  const selectedDeviceLabel = getSelectedDeviceLabel(options);

  function moveToPreviousMode() {
    setSelectedIndex(currentIndex => getPreviousIndex(currentIndex));
  }

  function moveToNextMode() {
    setSelectedIndex(currentIndex => getNextIndex(currentIndex));
  }

  function sendSelectedMode() {
    const selectedMode = MODES[selectedIndex];
    const result = sendMode(selectedMode, options);

    setStatusMessage(result.message);

    if (result.ok) {
      setLastSentMode(selectedMode);
    }
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {isRawModeSupported ? (
        <KeyboardHandler
          onMovePrevious={moveToPreviousMode}
          onMoveNext={moveToNextMode}
          onSendMode={sendSelectedMode}
          onQuit={exit}
        />
      ) : null}

      <Header />

      <Box>
        <Box flexDirection="column" width={64} marginRight={2}>
          <ModePanel selectedIndex={selectedIndex} lastSentMode={lastSentMode} />

          <Box marginTop={1}>
            <StatusPanel
              lastSentMode={lastSentMode}
              statusMessage={statusMessage}
              selectedDeviceLabel={selectedDeviceLabel}
            />
          </Box>
        </Box>

        <Box flexDirection="column" width={34}>
          <ControlsPanel />

          <Box marginTop={1}>
            <SessionPanel isInteractive={isRawModeSupported} selectedDeviceLabel={selectedDeviceLabel} />
          </Box>
        </Box>
      </Box>

      <Footer />
    </Box>
  );
}

function main() {
  let options: CliOptions;

  try {
    options = parseCliOptions(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CLI error';
    process.stderr.write(`${message}\n`);
    process.exit(1);
    return;
  }

  if (options.showHelp) {
    printHelp();
    return;
  }

  if (options.showVersion) {
    printVersion();
    return;
  }

  if (options.mode) {
    const result = sendMode(options.mode, options);
    const output = `${result.message}\n`;

    if (result.ok) {
      process.stdout.write(output);
      return;
    }

    process.stderr.write(output);
    process.exit(1);
    return;
  }

  render(<App options={options} />);
}

main();
