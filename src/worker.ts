import { IRequest, Router, json, html, createResponse, error } from 'itty-router';

const router = Router();

export interface Env {
	ASSEMBLYAI_API_KEY: string;
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
		const client = new AssemblyAiClient(env.ASSEMBLYAI_API_KEY);
		const uploadUrl = await client.uploadFile(file);
		let transcript = await client.createTranscript(uploadUrl);
		const newUrl = new URL(`/transcript/${transcript.id}`, request.url);

		return Response.redirect(newUrl.toString(), 303);
	})
	.get('/transcript/:id', async (request: IRequest, env: Env) => {
		const id = request.params.id;
		const client = new AssemblyAiClient(env.ASSEMBLYAI_API_KEY);
		const transcript = await client.getTranscript(id);
		if (transcript.status === 'completed') {
			return json(transcript);
		} else {
			return json(transcript, {
				headers: {
					'Refresh': '3' // refreshes the browser every 3 seconds
				}
			});
		}
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
	public async createTranscript(fileUrl: string) {
		const response = await fetch(`${AssemblyAiClient.baseUrl}/transcript`, {
			method: 'POST',
			headers: {
				authorization: this.apiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				audio_url: fileUrl
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
	public async waitForTranscript(id: string) {
		const pollingEndpoint = `${AssemblyAiClient.baseUrl}/transcript/${id}`

		while (true) {
			const pollingResponse = await fetch(pollingEndpoint, {
				headers: {
					authorization: this.apiKey,
				},
			})
			const transcript = (await pollingResponse.json()) as Transcript;
			switch (transcript.status) {
				case 'queued':
				case 'processing':
					await new Promise((resolve) => setTimeout(resolve, 3000))
					break;
				case 'completed':
					return transcript;
				case 'error':
					throw new Error(`Transcription failed: ${transcript.error}`)
			}
		}
	}
}

type Transcript = {
	id: string;
	text: string;
	status: string;
	error: any;
}


export default {
	fetch: (req: IRequest, ...args: any) => router
		.handle(req, ...args)
		.then(json)
		.catch(error)
};