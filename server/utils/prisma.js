const { PrismaClient } = require("@prisma/client");


const withPoolLimit = (url) => {
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  const limit = Number(process.env.PRISMA_CONNECTION_LIMIT || 5);
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${limit}`;
};

const prisma =
  global.__prisma ||
  new PrismaClient({
    datasources: { db: { url: withPoolLimit(process.env.DATABASE_URL) } },
  });
if (process.env.NODE_ENV !== "production") global.__prisma = prisma;

module.exports = prisma;