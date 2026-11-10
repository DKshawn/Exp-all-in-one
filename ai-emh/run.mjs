import { main } from "./src/main.mjs";

main().catch((error) => {
  console.error(`\n错误：${error.message}`);
  process.exitCode = 1;
});
