import {loadAssetRegistry} from './asset-registry.js';

const main = async () => {
  const registry = await loadAssetRegistry();
  console.log(
    `Validated ${registry.motionAssets.length} motion asset(s) and ${registry.brandAssets.length} brand asset(s).`,
  );
  for (const warning of registry.warnings) {
    console.warn(`Manual review required: ${warning}`);
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
