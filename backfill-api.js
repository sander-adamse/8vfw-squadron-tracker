// Backfill using the API endpoint
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => {
    rl.question(prompt, answer => resolve(answer));
  });
}

async function main() {
  try {
    const email = await question('Enter admin email: ');
    const password = await question('Enter admin password: ');
    
    console.log('\nLogging in...');
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!loginRes.ok) {
      const error = await loginRes.json();
      throw new Error(error.error || 'Login failed');
    }

    const { token } = await loginRes.json();
    console.log('✓ Logged in successfully\n');

    console.log('Running backfill...');
    const backfillRes = await fetch('http://localhost:3001/api/qualifications/backfill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!backfillRes.ok) {
      const error = await backfillRes.json();
      throw new Error(error.error || 'Backfill failed');
    }

    const result = await backfillRes.json();
    console.log(`✓ ${result.message}`);
    console.log(`✓ Inserted ${result.rowsInserted} NMQ qualifications\n`);
    console.log('Refresh your dashboard and you should see the NMQ counts populated!');
    
    rl.close();
  } catch (error) {
    console.error('✗ Error:', error.message);
    rl.close();
    process.exit(1);
  }
}

main();
