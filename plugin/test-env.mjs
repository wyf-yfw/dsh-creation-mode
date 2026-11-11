// 测试专用：把产物目录指到临时目录，避免测试写到真实的 plugin/created 并触发 prune。
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DSH_CA_CREATED_DIR = mkdtempSync(join(tmpdir(), 'ca-test-'));
