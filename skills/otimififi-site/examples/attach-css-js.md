# Example: upload CSS/JS then attach

```
1. upload_asset { name: "app.css", type: "text/css", content: "body{margin:0}" }
2. upload_asset { name: "app.js", type: "application/javascript", content: "console.log('hi')" }
3. upsert_page_html { page_id, import_mode: "body", html: "<section class='hero'>…</section>" }
4. set_page_assets {
     page_id,
     config: {
       cssFileLinks: [{ href: "<css public_url>" }],
       jsFileLinks: [{ src: "<js public_url>", defer: true, position: "body_end" }]
     }
   }
5. publish_page { page_id }
```

For site-wide chrome assets use `set_website_assets` instead of step 4.
