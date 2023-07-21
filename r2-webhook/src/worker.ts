import { IRequest, Router, json, html, text, error } from 'itty-router';

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
		let transcript = await client.createTranscript(fileUrl, webhookUrl);

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

class AssemblyAiClient {
	private static readonly baseUrl = 'https://api.assemblyai.com/v2';
	constructor(private readonly apiKey: string) { }
	public async uploadFile(file: File) {
		const response = await fetch(`${AssemblyAiClient.baseUrl}/upload`, {
			method: 'POST',
			headers: {
				authorization: this.apiKey
			},
			body: file.stream()
		});
		const json = (await response.json()) as { 'upload_url': string };
		return json.upload_url;
	}
	public async createTranscript(fileUrl: string, webhookUrl: string) {
		const response = await fetch(`${AssemblyAiClient.baseUrl}/transcript`, {
			method: 'POST',
			headers: {
				authorization: this.apiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				audio_url: fileUrl,
				webhook_url: webhookUrl,
			})
		});
		const transcript = (await response.json()) as Transcript;
		return transcript;
	}
	public async getTranscript(id: string): Promise<Transcript> {
		const response = await fetch(`${AssemblyAiClient.baseUrl}/transcript/${id}`, {
			headers: {
				authorization: this.apiKey,
			},
		})
		const transcript = (await response.json()) as Transcript;
		return transcript;
	}
	public async getSubtitles(id: string, subtitleFormat: 'srt' | 'vtt'): Promise<string> {
		const response = await fetch(`${AssemblyAiClient.baseUrl}/transcript/${id}/${subtitleFormat}`, {
			headers: {
				authorization: this.apiKey,
			},
		})
		const subtitles = await response.text();
		return subtitles;
	}
}

type Transcript = {
	id: string;
	text: string;
	status: string;
	error: any;
	audio_url: string;
}
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