#!/usr/bin/env node
/**
 * Script to run on a daily basis that writes out data from some db tables:
 * provider_locations, external_ids, availability, and availability_log. It
 * decides which days of the availability_log to export by checking for
 * missing output files in the S3 bucket specified by the environment var
 * DATA_SNAPSHOT_S3_BUCKET.
 *
 * By default the script writes to local disk (in a directory named output/).
 * Add the `--write-to-s3` flag to upload the resulting ndjson files into
 * the DATA_SNAPSHOT_S3_BUCKET.
 *
 * For the sake of keeping the availability_log table from exploding in size,
 * the script can clear old rows out. To enable this deletion, add the flag
 * `--clear-log` when running the command.
 */

const Sentry = require("@sentry/node");
const aws = require("aws-sdk");
const fs = require("fs");
const knex = require("knex");
const knexConfig = require("../knexfile");
const luxon = require("luxon");
const JSONStream = require("JSONStream");
const stream = require("stream");

Sentry.init();

const db = knex(knexConfig.development);
const s3 = new aws.S3();

const FIRST_RUN_DATE = luxon.DateTime.fromISO("2021-05-19", { zone: "utc" });

function writeLog(...args) {
  console.warn(...args);
}

function selectSqlPoint(column) {
  return `
  CASE WHEN ${column} is null THEN null
  ELSE
    json_build_object(
      'longitude', st_x(${column}::geometry),
      'latitude', st_y(${column}::geometry)
    )
  END as ${column}
  `.trim();
}

function removeNullPropertiesStream() {
  return new stream.Transform({
    objectMode: true,
    transform(record, _encoding, callback) {
      for (const key of Object.keys(record)) {
        if (record[key] === null) delete record[key];
      }
      callback(null, record);
    },
  });
}

function getQueryStream(queryBuilder) {
  return queryBuilder.stream().pipe(JSONStream.stringify(false));
}

function getTableStream(table) {
  return getQueryStream(db(table).select("*"));
}

function getProviderLocationsStream() {
  return getQueryStream(
    db("provider_locations")
      .select("*")
      .select(db.raw(selectSqlPoint("position"))) // override binary-encoded column with json version
  );
}

function getAvailabilityLogStream(date) {
  return db("availability_log")
    .select("*")
    .where("checked_at", ">", formatDate(date))
    .andWhere("checked_at", "<=", formatDate(date.plus({ days: 1 })))
    .orderBy("checked_at", "asc")
    .stream()
    .pipe(removeNullPropertiesStream())
    .pipe(JSONStream.stringify(false));
}

async function getAvailabilityLogRunDates(upToDate) {
  const res = await s3
    .listObjects({
      Bucket: process.env.DATA_SNAPSHOT_S3_BUCKET,
      Prefix: "availability_log/",
    })
    .promise();
  const existingPaths = new Set(res.Contents.map((f) => f.Key));

  const dateRange = eachDayOfInterval({
    start: FIRST_RUN_DATE,
    end: upToDate,
  });

  const missing = [];
  for (const date of dateRange) {
    if (!existingPaths.has(pathFor("availability_log", date))) {
      missing.push(date);
    }
  }
  return missing;
}

async function deleteLoggedAvailabilityRows(upToDate) {
  await db("availability_log")
    .where("checked_at", "<=", formatDate(upToDate))
    .del();
}

async function uploadStream(s, path) {
  return s3
    .upload({
      Bucket: process.env.DATA_SNAPSHOT_S3_BUCKET,
      Key: path,
      Body: s.pipe(stream.PassThrough()), // PassThrough supports .read(), which aws-sdk.s3 needs
    })
    .promise();
}

async function writeStreamToLocal(s, path) {
  const writeStream = fs.createWriteStream(`output/${path}`);
  s.pipe(writeStream);
  return new Promise((resolve, reject) => {
    s.on("close", resolve);
    s.on("error", reject);
  });
}

async function ensureLocalOutputDirs() {
  const dirs = [
    "provider_locations",
    "external_ids",
    "availability",
    "availability_log",
  ];
  for (const dir of dirs) {
    try {
      fs.mkdirSync(`output/${dir}`, { recursive: true });
    } catch (err) {
      if (err.code !== "EEXIST") {
        throw err;
      }
    }
  }
}

function formatDate(date) {
  return date.toFormat("yyyy-MM-dd");
}

function pathFor(type, date) {
  return `${type}/${type}-${formatDate(date)}.ndjson`;
}

function eachDayOfInterval({ start, end }) {
  const interval = start.startOf("day").until(end.endOf("day"));
  return interval.splitBy({ days: 1 }).map((d) => d.start);
}

async function main() {
  const clearLog = process.argv.includes("--clear-log");
  let writeStream = uploadStream;

  if (!process.argv.includes("--write-to-s3")) {
    writeStream = writeStreamToLocal;
    await ensureLocalOutputDirs();
  }

  if (!process.env.DATA_SNAPSHOT_S3_BUCKET) {
    writeLog("DATA_SNAPSHOT_S3_BUCKET environment var required");
    return;
  }

  const now = luxon.DateTime.utc();
  const runDate = now.minus({ days: 1 }); // run for previous day

  for (const table of ["external_ids", "availability"]) {
    writeLog(`writing ${pathFor(table, runDate)}`);
    await writeStream(getTableStream(table), pathFor(table, runDate));
  }

  writeLog(`writing ${pathFor("provider_locations", runDate)}`);
  await writeStream(
    getProviderLocationsStream(),
    pathFor("provider_locations", runDate)
  );

  const logRunDates = await getAvailabilityLogRunDates(runDate);
  for (const logRunDate of logRunDates) {
    writeLog(`writing ${pathFor("availability_log", logRunDate)}`);
    await writeStream(
      getAvailabilityLogStream(logRunDate),
      pathFor("availability_log", logRunDate)
    );
  }

  if (clearLog) {
    const clearCutoff = runDate.minus({ days: 7 });
    writeLog(`clearing availability_log rows up to ${formatDate(clearCutoff)}`);
    await deleteLoggedAvailabilityRows(clearCutoff);
  }
}

main()
  .then(() => writeLog("done"))
  .catch((error) => {
    console.error(error);
    Sentry.captureException(error);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
