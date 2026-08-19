const payloadStr = 'eyJzaWQiOiIyZDhkZTY5MDE2YWYiLCJpYXQiOjE3ODcxNTQ5MzQsImFsbG93Q29tbWVudHMiOnRydWV9'
const decoded = Buffer.from(payloadStr, 'base64url').toString('utf8')
console.log('Decoded:', decoded)
console.log('Parsed:', JSON.parse(decoded))
