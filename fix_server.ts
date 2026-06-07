import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
`async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());`,
`const app = express();
app.use(express.json());`
);

const viteIndex = code.indexOf('// Vite integration');
const bottomPart = code.substring(viteIndex);
const topPart = code.substring(0, viteIndex);

const newBottom = bottomPart.replace(
  `// Vite integration
  let vite;`,
`async function startViteAndListen() {
  const PORT = 3000;
  // Vite integration
  let vite;`
).replace(
`  app.listen(PORT, '0.0.0.0', () => {
    console.log(\`Server running at http://localhost:\${PORT}\`);
  });
}

const httpsAgent`,
`  app.listen(PORT, '0.0.0.0', () => {
    console.log(\`Server running at http://localhost:\${PORT}\`);
  });
}

if (!process.env.VERCEL) {
  startViteAndListen();
}

export default app;

const httpsAgent`
);

fs.writeFileSync('server.ts', topPart + newBottom);

// Also remove `startServer()` at the end of file
let finalCode = fs.readFileSync('server.ts', 'utf8');
finalCode = finalCode.replace(/^startServer\(\);[\s\n]*$/m, '');
fs.writeFileSync('server.ts', finalCode);

console.log("Refactoring complete");
