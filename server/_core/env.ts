export const ENV = {
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  localDevAuth: process.env.LOCAL_DEV_AUTH === "1",
  isProduction: process.env.NODE_ENV === "production",
  s3BucketName: process.env.S3_BUCKET_NAME ?? "",
  s3Region: process.env.AWS_REGION ?? process.env.S3_REGION ?? "",
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterModel: process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free",
};

