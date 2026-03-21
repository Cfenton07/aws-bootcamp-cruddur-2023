const sharp = require('sharp');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const client = new S3Client();

const destBucket = process.env.DEST_BUCKET_NAME;
const folderInput = process.env.FOLDER_INPUT;
const folderOutput = process.env.FOLDER_OUTPUT;
const width = parseInt(process.env.PROCESS_WIDTH);
const height = parseInt(process.env.PROCESS_HEIGHT);

exports.handler = async (event) => {
  console.log('event', JSON.stringify(event, null, 2));

  const srcBucket = event.Records[0].s3.bucket.name;
  const srcKey = decodeURIComponent(
    event.Records[0].s3.object.key.replace(/\+/g, ' ')
  );

  console.log('srcBucket:', srcBucket);
  console.log('srcKey:', srcKey);

  // Build the destination key by replacing input folder with output folder
  const filename = srcKey.replace(`${folderInput}/`, '');
  const destKey = `${folderOutput}/${filename}`;

  console.log('destKey:', destKey);

  // Get the source image from S3
  const getCommand = new GetObjectCommand({
    Bucket: srcBucket,
    Key: srcKey,
  });
  const getResponse = await client.send(getCommand);

  // Convert the readable stream to a buffer
  const chunks = [];
  for await (const chunk of getResponse.Body) {
    chunks.push(chunk);
  }
  const inputBuffer = Buffer.concat(chunks);

  // Process the image with sharp
  const outputBuffer = await sharp(inputBuffer)
    .resize(width, height, {
      fit: 'cover',
      position: 'centre',
    })
    .toBuffer();

  // Upload the processed image to S3
  const putCommand = new PutObjectCommand({
    Bucket: destBucket,
    Key: destKey,
    Body: outputBuffer,
    ContentType: 'image/jpeg',
  });
  await client.send(putCommand);

  console.log(`Successfully processed ${srcKey} -> ${destKey}`);
};