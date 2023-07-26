import { IRequest, Router, json, html, error } from 'itty-router';
import { AssemblyAiClient } from './assemblyai';

const router = Router();

export interface Env {
	ASSEMBLYAI_API_KEY: string;
	transcriptsBucket: R2Bucket;
}

router.get('/', () => html(`<!DOCTYPE html>
<body>
	<form action="/upload-file" method="post" enctype="multipart/form-data">
		<label for="file">Upload an audio or video file:</label> <br>
		<input type="file" name="file" id="file" /><br>
		<button type="submit">Submit</button>
	</form>
</body>`))
	.post('/upload-file', async (request, env: Env) => {
		const formData = await request.formData();
		const file = formData.get('file') as unknown as File;
		const objectKey = `${crypto.randomUUID()}.${getExtension(file.name)}`;
		await env.transcriptsBucket.put(objectKey, file.stream());

		const client = new AssemblyAiClient(env.ASSEMBLYAI_API_KEY);
		const fileUrl = createUrl(`/file/${objectKey}`, request);
		const webhookUrl = createUrl(`/webhook`, request);
		let transcript = await client.createTranscript({ audio_url: fileUrl, webhook_url: webhookUrl });

		const newUrl = new URL(`/file/${transcript.id}.srt`, request.url);
		return Response.redirect(newUrl.toString(), 303);
	})
	.get('/file/:key', async (request: IRequest, env: Env) => {
		const key = request.params.key;
		const object = await env.transcriptsBucket.get(key);

		if (object === null) {
			return new Response('Object Not Found', { status: 404 });
		}

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set('etag', object.httpEtag);

		return new Response(object.body, {
			headers
		});
	})
	.post('/webhook', async (request: IRequest, env: Env) => {
		const { transcript_id: transcriptId, status } = await request.json<WebhookBody>();
		console.log(`transcriptId:`, transcriptId);
		console.log(`status:`, status);

		if (status !== 'completed') return new Response('ok');

		const client = new AssemblyAiClient(env.ASSEMBLYAI_API_KEY);
		const subtitles = await client.getSubtitles(transcriptId, 'srt');

		const objectKey = `${transcriptId}.srt`
		await env.transcriptsBucket.put(objectKey, subtitles);
	});

type WebhookBody = {
	transcript_id: string;
	status: string;
}

const createUrl = (url: string, request: IRequest) => new URL(url, request.url).toString();
const getExtension = (fileName: string) => fileName.slice((fileName.lastIndexOf(".") - 1 >>> 0) + 2);

export default {
	fetch: (req: IRequest, ...args: any) => router
		.handle(req, ...args)
		.then(json)
		.catch(error)
};