import { Client } from "@elastic/elasticsearch";

export const es = new Client({
  node: process.env.ELASTIC_SEARCH_CLIENT_URL || "http://localhost:9200",
});
