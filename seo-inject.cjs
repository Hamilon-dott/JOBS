const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const jsonLd = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "BD Govt Job Circular 2026",
      "url": "https://jobs.talukdaracademy.com.bd/",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://jobs.talukdaracademy.com.bd/?q={search_term_string}",
        "query-input": "required name=search_term_string"
      },
      "description": "All Government Job Circulars in Bangladesh. Find recent govt job circular 2026, new govt recruitment, Private job circular 2026 Bangladesh, BD Job Circular 2026 apply online, NGO Job Circular 2026 Bangladesh."
    }
    </script>
`;

html = html.replace('</head>', jsonLd + '</head>');
fs.writeFileSync('index.html', html);
console.log('SEO JSON-LD injected');
