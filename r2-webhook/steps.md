Generate your Cloudflare Workers project:
```bash
npm create cloudflare@latest
```

Run you Workers project
```bash
npm run start
# wrangler dev
```

Deploy Workers to Cloudflare Workers Runtime
```bash
npm run deploy
# wrangler deploy
```

Create secret in Cloudflare Workers Runtime
```bash
wrangler secret put ASSEMBLYAI_API_KEY
# you will be prompted to enter the value of the secret
```

Create a Cloudflare R2 Bucket:
```bash
wrangler r2 bucket create transcripts
# transcripts is the name of the bucket
```