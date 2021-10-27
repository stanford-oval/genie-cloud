import * as Path from "path";

import * as Winston from "winston";
import { Factory, Format } from "@stanford-oval/logging";

const RUN_ROOT = Path.resolve(__dirname, "..");

export default new Factory({
    runRoot: RUN_ROOT,
    level: "http",
    envVarPrefix: "GENIE_LOG",
    transports: [
        new Winston.transports.Console({
            format: Format.prettySimple({ colorize: true }),
        }),
    ],
});
