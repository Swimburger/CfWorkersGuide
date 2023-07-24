/**
 * The transcript object returned by the AssemblyAI API.
 * You can add more properties to this type if you need them.
 * Find the full type definition here: https://www.assemblyai.com/docs/API%20reference/transcript#the-transcript-object
 */
export type Transcript = {
  id: string;
  text: string;
  status: string;
};

/** 
 * The error object returned by the AssemblyAI API.
 * If the status is "error", the error property will contain a human-readable error message.
 */
export type ErrorBody = {
  status: string;
  error: string;
}

/**
 * A client for the AssemblyAI API.
 */
export class AssemblyAiClient {
  private static readonly baseUrl = 'https://api.assemblyai.com/v2';

  /**
   * @param apiKey The API key for the AssemblyAI API.
   */
  constructor(private readonly apiKey: string) { }

  /**
   * Uploads a file to AssemblyAI CDN. 
   * The file will only be accessible to AssemblyAI and be removed after a period of time.
   * @param file Audio or video file to upload.
   * @returns The URL of the uploaded file. 
   */
  public async uploadFile(file: File): Promise<string> {
    const response = await fetch(`${AssemblyAiClient.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        authorization: this.apiKey
      },
      body: file.stream()
    });
    const json = (await response.json()) as { 'upload_url': string; } | ErrorBody;
    AssemblyAiClient.throwIfError(json);
    return json.upload_url;
  }

  /**
   * Creates a transcript in the AssemblyAI API. The transcript will be queued for processing, 
   * but an empty transcript object is returned immediately.
   * @param fileUrl The URL of the audio or video file to transcribe.
   * @returns Empty transcript object
   */
  public async createTranscript(fileUrl: string): Promise<Transcript> {
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
    const transcript = (await response.json()) as Transcript | ErrorBody;
    AssemblyAiClient.throwIfError(transcript);
    return transcript;
  }

  /**
   * Gets the transcript by its ID.
   * @param id The ID of the transcript to retrieve.
   * @returns Transcript object
   */
  public async getTranscript(id: string): Promise<Transcript> {
    const response = await fetch(`${AssemblyAiClient.baseUrl}/transcript/${id}`, {
      headers: {
        authorization: this.apiKey,
      },
    });
    const transcript = (await response.json()) as Transcript | ErrorBody;
    AssemblyAiClient.throwIfError(transcript);
    return transcript;
  }

  /**
   * Polls the transcript status until it is completed, then returns the completed transcript object.
   * @param id The ID of the transcript to retrieve.
   * @returns Transcript object
   */
  public async waitForTranscript(id: string) {
    const pollingEndpoint = `${AssemblyAiClient.baseUrl}/transcript/${id}`;

    while (true) {
      const pollingResponse = await fetch(pollingEndpoint, {
        headers: {
          authorization: this.apiKey,
        },
      });
      const transcript = (await pollingResponse.json()) as Transcript | ErrorBody;
      AssemblyAiClient.throwIfError(transcript);
      switch (transcript.status) {
        case 'queued':
        case 'processing':
          await new Promise((resolve) => setTimeout(resolve, 3000));
          break;
        case 'completed':
          return transcript;
      }
    }
  }

  /**
   * Throws an error if the body is an error object.
   * @param body The response object returned by the AssemblyAI API to check.
   */
  private static throwIfError<T extends object>(body: T | ErrorBody): asserts body is T {
    if ('status' in body && body.status === 'error') throw new Error(body.error);
  }
}