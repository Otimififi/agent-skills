# Verification Checklist

Use this checklist before publishing a page or reporting it as live.

## Identity and Scope

- Call `mcp_health` and confirm the expected tools are registered.
- Call `auth_status` and confirm the access token is valid.
- Call `list_websites` and select the intended website explicitly.

## Page Identity

- Call `get_page_by_pathname` before creating a page.
- Confirm the pathname has no leading slash and uses `""` for the home page.
- Confirm `website_id`, page ID, and `is_dynamic` match the request.
- Use `get_or_create_page` when repeated or concurrent calls are possible.

## Draft Content

- Run `plan_static_page_import` before importing a large full HTML document.
- Use `get_page_content` only when inspecting the actual HTML/config.
- Record `source_code_length` and `source_code_sha256` from the summary.
- Review `import_report.preflight.extracted`, `.sanitized`, and `.removed`.
- Confirm no local filesystem paths remain in HTML or asset configuration.
- Confirm assets use approved URLs and expected MIME types.

## Preview and Release

- Use `get_draft_preview_url` for an unpublished draft.
- Verify the signed preview URL loads the intended draft version.
- Do not describe a draft preview as a public URL.
- Keep `apply_static_page_import` at its default `publish=false` until review
  is complete.
- Call `publish_page` only after explicit user approval.
- Confirm the returned positive release version and live response.

## Public URL

- Call `get_public_urls` after publishing.
- Confirm the returned `site_url` and page `full_url`.
- Open the URL and check desktop and mobile rendering when relevant.
- Verify the page source references public asset URLs, not workspace paths.
