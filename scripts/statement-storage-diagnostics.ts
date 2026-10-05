import { statementStorageDiagnostics } from "../lib/storage/statement-pdf-config";

const report = statementStorageDiagnostics();
console.log(JSON.stringify(report, null, 2));
if (!report.ready) {
  process.exitCode = 2;
}
