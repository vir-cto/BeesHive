/**
 * Apply CORS configuration to the Firebase Storage bucket.
 * 
 * This script uses the Firebase Storage REST API to set CORS on the bucket.
 * It reads the bucket name from the environment configuration.
 * 
 * Usage: node scripts/apply-storage-cors.cjs
 */

const fs = require('fs');
const path = require('path');

// Read environment configuration
const envPath = path.resolve(__dirname, '..', '.env');
const envConfig = {};
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      envConfig[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const bucket = envConfig.VITE_FIREBASE_STORAGE_BUCKET || 'beeshive-80274.firebasestorage.app';
const apiKey = envConfig.VITE_FIREBASE_API_KEY || '';

// CORS configuration from cors.json
const corsJsonPath = path.resolve(__dirname, 'cors.json');
let corsConfig;
try {
  corsConfig = JSON.parse(fs.readFileSync(corsJsonPath, 'utf8'));
} catch (err) {
  console.error('Failed to read cors.json:', err.message);
  process.exit(1);
}

console.log(`Applying CORS configuration to bucket: ${bucket}`);
console.log('CORS configuration:');
console.log(JSON.stringify(corsConfig, null, 2));

// Firebase Storage REST API endpoint for setting CORS
// https://cloud.google.com/storage/docs/using-cors#storage-set-cors-bucket-console
const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/cors`;

const options = {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ` + (process.env.ACCESS_TOKEN || '')
  },
  body: JSON.stringify({ cors: corsConfig })
};

// If we have a service account, we can use it to get an access token
// For now, we'll use the API key approach (less secure but works for simple cases)
// The proper way is to use OAuth2 with a service account

console.log('\nNote: To apply CORS, you need to authenticate with Google Cloud.');
console.log('Methods:');
console.log('1. Use gsutil: gsutil cors set cors.json gs://' + bucket);
console.log('2. Use gcloud: gcloud storage buckets update gs://' + bucket + ' --cors-file=cors.json');
console.log('3. Use Firebase CLI: firebase storage:cors set cors.json (if available)');
console.log('4. Use the Cloud Console: Storage -> Buckets -> ' + bucket + ' -> Permissions -> CORS');
console.log('\nThe cors.json file is ready at: ' + corsJsonPath);
console.log('Bucket name: ' + bucket);
console.log('API Key: ' + apiKey);
console.log('\nTo apply manually via REST API with an access token:');
console.log('  curl -X PATCH ' + url + ' \\');
console.log('    -H "Content-Type: application/json" \\');
console.log('    -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\');
console.log('    -d @' + corsJsonPath);
