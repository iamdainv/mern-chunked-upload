export class S3Service {
  constructor(@InjectAwsService("S3") private readonly s3: S3) {}

  async initiateMultipartUpload(filename: string): Promise<string> {
    return await this.s3
      .createMultipartUpload({
        Bucket: process.env.AWS_BUCKET,
        Key: filename,
      })
      .promise()
      .then((data) => data.UploadId)
      .catch((error) => {
        throw new Error(`Failed to initiate multipart upload: ${error}`);
      });
  }

  async uploadParts(uploadId: string, file: any): Promise<void> {
    const partSize = 5 * 1024 * 1024; // Set a suitable part size (e.g., 5MB)
    const numParts = Math.ceil(file.size / partSize);
    const parts: any = [];

    for (let i = 0; i < numParts; i++) {
      const start = i * partSize;
      const end = Math.min(start + partSize - 1, file.size - 1);
      const content = file.buffer.slice(start, end + 1);

      const params = {
        Bucket: process.env.AWS_BUCKET,
        Key: file.originalname,
        UploadId: uploadId,
        PartNumber: i + 1,
        Body: content,
      };

      await this.s3
        .uploadPart(params)
        .promise()
        .catch((error) => {
          throw new Error(`Failed to upload part ${i + 1}: ${error}`);
        });

      parts.push({
        PartNumber: i + 1,
        ETag: `"${params.Body.toString("hex")}"`,
      });
    }

    return parts;
  }

  async completeMultipartUpload(
    uploadId: string,
    parts: any[],
    file: any
  ): Promise<void> {
    await this.s3
      .completeMultipartUpload({
        Bucket: process.env.AWS_BUCKET,
        Key: file.originalname,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts,
        },
      })
      .promise()
      .catch((error) => {
        throw new Error(`Failed to complete multipart upload: ${error}`);
      });
  }

  async abortMultipartUpload(uploadId: string, file: any): Promise<void> {
    await this.s3
      .abortMultipartUpload({
        Bucket: process.env.AWS_BUCKET,
        Key: file.originalname,
        UploadId: uploadId,
      })
      .promise()
      .catch((error) => {
        console.warn(`Failed to abort multipart upload: ${error}`);
      });
  }

  async multipartUpload(file: any): Promise<string> {
    const uploadId = await this.initiateMultipartUpload(file.originalname);
    try {
      const parts = await this.uploadParts(uploadId, file);
      await this.completeMultipartUpload(uploadId, parts, file);
      return `https://s3.<span class="math-inline">\{process\.env\.AWS\_REGION\}\.amazonaws\.com/</span>{process.env.AWS_BUCKET}/${file.originalname}`;
    } catch (error) {
      await this.abortMultipartUpload(uploadId, file);
      throw error;
    }
  }
}
