# Security

Security reports can be filed privately through GitHub's security advisory feature for `yhay81/yasumi-kumi`.

- Recommendation and telemetry endpoints accept same-origin JSON POST requests only.
- Request bodies are size limited; year, budget, and date are normalized against the supported calendar.
- Official holiday data is static and has no runtime upstream dependency.
- Selected leave dates remain in browser local storage and are not included in telemetry.
- DOM additions use `textContent`; no supplied value is interpreted as markup or code.
- Content Security Policy blocks third-party scripts, framing, and unnecessary browser capabilities.
