import { Request } from "express";
import type { Knex } from "knex";

export const LOG_LEVEL = process.env.LOG_LEVEL || "info";

export function getApiKeys(): Array<string> {
  let keyList = process.env.API_KEYS;
  if (!keyList) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "You must set API_KEYS to a comma-separated list of keys in production"
      );
    } else {
      keyList = "dev-key";
    }
  }

  return keyList.split(",").map((key) => key.trim());
}

export function getHostUrl(request?: Request): string {
  let hostUrl = process.env.HOST_URL;
  if (!hostUrl) {
    if (!request) {
      throw new Error("Cannot calculate host URL without a request");
    } else {
      hostUrl = `${request.protocol}://${request.headers.host}`;
    }
  }
  if (hostUrl.endsWith("/")) hostUrl = hostUrl.slice(0, -1);

  return hostUrl;
}

export function loadDbConfig(): Knex.Config {
  const knexfile = require("../knexfile");
  const nodeEnv = process.env.NODE_ENV || "development";
  return knexfile[nodeEnv];
}
