// Metro 설정: 모노레포의 공용 동기화 코어(shared/sync-core)를 소스 그대로 번들에 포함한다.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const syncCoreRoot = path.resolve(projectRoot, '../shared/sync-core');

const config = getDefaultConfig(projectRoot);

// 프로젝트 밖 폴더를 감시/번들 대상에 포함
config.watchFolders = [...(config.watchFolders ?? []), syncCoreRoot];

// '@calendar/sync-core' -> shared/sync-core (package.json의 main: src/index.ts)
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  '@calendar/sync-core': syncCoreRoot,
};

// sync-core 안의 파일이 import하는 외부 모듈은 이 앱의 node_modules에서 찾는다
// (sync-core는 런타임 의존성이 없지만 안전장치)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  ...(config.resolver.nodeModulesPaths ?? []),
];

// sync-core의 test/ (node:sqlite 사용)와 sync-core의 node_modules는 번들에 들어가지 않는다.
// 어디에서도 import하지 않으므로 포함되지 않지만, 파일 감시 대상에서도 제외한다.
const escape = (p) => p.replace(/[\/]/g, '[\\/]');
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : config.resolver.blockList ? [config.resolver.blockList] : []),
  new RegExp(`${escape(path.join(syncCoreRoot, 'test'))}.*`),
  new RegExp(`${escape(path.join(syncCoreRoot, 'node_modules'))}.*`),
];

module.exports = config;
