import { IRequest, Router, json, html, text, error } from 'itty-router';
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
		let transcript = await client.createTranscript({ audio_url: fileUrl });

		const newUrl = new URL(`/transcript/${transcript.id}`, request.url);
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
			headers,
		});
	})
	.get('/transcript/:id', async (request: IRequest, env: Env) => {
		const id = request.params.id;
		const client = new AssemblyAiClient(env.ASSEMBLYAI_API_KEY);
		const transcript = await client.getTranscript(id);
		if (transcript.status === 'completed') {
			return text(transcript.text);
		} else {
			return text(transcript.status, {
				headers: {
					'Refresh': '3' // refreshes the browser every 3 seconds
				}
			});
		}
	});

const createUrl = (url: string, request: IRequest) => new URL(url, request.url).toString();
const getExtension = (fileName: string) => fileName.slice((fileName.lastIndexOf(".") - 1 >>> 0) + 2);

export default {
	fetch: (req: IRequest, ...args: any) => router
		.handle(req, ...args)
		.then(json)
		.catch(error)
};