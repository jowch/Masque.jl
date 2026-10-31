# Security policy

## Supported versions

Fixes go into the latest release only. Masque is before 1.0, so upgrade to the newest
`0.x.y` to get a fix.

## Reporting a vulnerability

Report it privately through
[GitHub's private vulnerability reporting](https://github.com/jowch/Masque.jl/security/advisories/new),
not in a public issue. Include the Masque version, the backend (CairoMakie or WGLMakie),
and a notebook or snippet that shows the problem.

Masque runs JavaScript in the notebook page, so the reports that matter most are ones where
plot data or labels can run script in the page (for example through tooltip text), or where
the overlay script a page loads from jsDelivr could differ from the release it claims to be.
