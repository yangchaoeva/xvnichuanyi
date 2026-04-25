import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const getProjectRoot = () => process.cwd();

const deleteIfExists = (absolutePath) => {
  if (!fs.existsSync(absolutePath)) return;
  fs.rmSync(absolutePath, { recursive: true, force: true });
};

const root = getProjectRoot();

deleteIfExists(path.join(root, '.next'));
deleteIfExists(path.join(root, '.turbo'));

