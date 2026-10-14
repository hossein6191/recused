# Estuary Companies Register

A fictional public register of companies, made for the Recused demonstration. Every company, address, number
and person on these pages is invented; none of them is a real company or a real person.

A desk on Recused names, when it is opened, the address prefixes of the public registers a challenge may cite.
The demonstration desk names this folder, pinned to one commit of this repository on raw.githubusercontent.com,
so that every validator fetches exactly the same bytes and nobody can change a page after the desk was opened.

What a page reads as depends on the spend it is cited against, because the question is about that spend's payee.
Mara Quist (the public name of member B) files a disclosure that names Pelican Press, her print shop, and nothing
else. Cited against her signature:

| page | what it shows | on a spend to Gull Catering Ltd | on a spend to the company the page is about |
|---|---|---|---|
| `gull-catering-ltd.html` | Mara Quist is a current director of Gull Catering Ltd and holds 40 percent of it | hidden: a present relation her disclosure never mentions | the same, hidden |
| `pelican-press-ltd.html` | Mara Quist and her sister own and direct Pelican Press Ltd | clean: it names her, and only for the print shop she disclosed | her own reading of such a spend comes back interested (version 1's run read it `GU`), so it is not counted and there is no signature to challenge; if it were counted, clean |
| `osprey-paper-ltd-former-officers.html` | Mara Quist was a director until 2018 and is no longer | clean: it names her, and says nothing about Gull Catering | unclear: a former relation is not a present one |
| `heron-signs-ltd.html` | officers that include no member of the demonstration desk | unclear: it never names her | unclear |

A page that does not name the member it is cited against reads unclear for anyone, so the challenger's bond goes
back: a clean finding, which pays the bond to the member, needs a page that names them. The demonstration run
cites `pelican-press-ltd.html` (clean) and `gull-catering-ltd.html` (hidden) against Mara Quist, and
`gull-catering-ltd.html` against Tomas Brandt, whom it does not name (unclear).

Each page is plain text inside one `pre` block, so it reads the same whether a browser renders the HTML or a
fetch returns the source as text.
