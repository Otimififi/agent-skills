# Example: landing page from full HTML

```
1. create_website { title: "Acme Launch" }
2. upsert_page_html {
     page_id: "<home page id from list_pages>",
     import_mode: "full_html",
     html: "<!doctype html><html><head><title>Acme</title>
            <style>body{font-family:system-ui}</style></head>
            <body><main><h1>Ship faster</h1>
            <a href='#cta'>Get started</a></main></body></html>"
   }
3. publish_page { page_id }
4. get_public_urls { website_id }  → share site_url
```
