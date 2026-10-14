# Recused

A shared fund where a spend needs two countersignatures, and the contract
refuses a countersignature when the interests the signer filed **before the
spend existed** are moved by it, in either direction, whether the spend goes
through or not. Its limits belong here, before anything else. The contract reads
what a member filed. Version 1 could not know what a member hid; version 2
catches one kind of hiding, a relation to the payee that a public register shows:
members stake to sign, a carried spend waits in a short hold before it pays, and
during the hold anyone may cite a page of a register the desk named in advance,
which every validator reads on the live web. What it still cannot catch is a
relation that no register the desk named shows, or a member that register lists
under a name other than the public name they gave (a page that does not name the
member reads unclear, so such a member also collects no bonds): such a member reads clear, and
so does one who leaves something out in good faith, and so does one who files a
false statement that no named register contradicts. A desk with open enrolment
is not safe for money that matters, because three addresses one person controls
can post a spend and carry it; a desk holding real money names its members when
it is opened. A member who discloses broadly and honestly will be recused often.
A sentence saying who a payee is, is a member's signed claim and may be false,
and a false one can recuse an honest member for as long as that payee address
goes unpaid. "Before" is kept per payee address, and the fund cannot know that
two addresses are one payee. What the contract means by "clear" is exactly three
things and no more: not the poster, not paid at an address that is the signer's
own or that they declared, and not moved under either branch as read against
what they filed first.

## Version 2: what a member hid, a public register can prove

Members stake to sign, a carried spend waits in a short hold before it pays, and
during the hold anyone may cite a page from a public register the desk named in
advance. Validators read that page on the live web, and if it shows a relation
to the payee the member never disclosed, the signature is struck, the payment
stops and the member's stake pays the whistleblower, all in the same transaction.

Version 1 opened this README by admitting that the contract reads what a member
filed and cannot know what they hid. Version 2 answers that first stated limit
with the one thing only GenLayer can do here: several validators each fetch the
same public page themselves, read it against the member's own disclosure, and
the contract acts only on what they agree it says. No deterministic contract can
read a web page, an oracle that reads it for the contract is one party's word,
and a single model's reading of it is one reader's accusation. Here the page is
fetched by every validator, fingerprinted by every validator, and judged by
every validator in two framings and two presentation orders, and the finding
and the fingerprint must match exactly or nothing is stored.

### What changed in the contract

- **`open_desk`** takes three more terms, fixed for good when the desk is opened:
  1 to 3 **registers** (https address prefixes, each at most 120 characters,
  named before any spend exists, so that a challenger cannot cite a page of their
  own choosing; whoever controls a named prefix, the opener included, controls
  what it serves, which is why `desk()` publishes them before anyone enrols), the
  **member stake** (0.1 to 100 GEN) and the **hold** (5 minutes to 7 days).
- **`enrol`** is payable and takes a **public name**, the name public registers
  would list the member under. It takes exactly the desk's stake, holds it for
  that member, and refunds the value with `{"ok": false}` on every refusal; it
  never raises after taking value. **`restake`** tops a slashed stake back up
  with exactly the amount missing. A member whose stake is not whole, or who has
  **retired**, is refused before any model is asked, and the attempt is not
  spent. **`retire`** stops a member countersigning; **`withdraw_stake`** returns
  a retired member's stake once no spend it signed is open or in its hold.
- **`approve`** reads exactly as in version 1. The change is what the second
  clear reading does: it pays nothing, latches the spend **holding** until
  `hold_until`, keeps its amount committed and counts the hold against both
  signers. A spend in its hold never expires.
- **`release(desk, spend)`**, open to anyone once the hold has ended, pays the
  payee exactly as the second clear reading did in version 1. A signature struck
  stands struck for the rest of its run, so if either counted member was struck
  on another spend to the same payee address in the meantime, `release` drops
  that signature instead (no second slash), the spend goes back to open and
  nothing is paid; the second clear reading makes the same check before it
  starts a hold.
- **`challenge(desk, spend, member_no, url)`**, open to anyone but the member
  challenged, while the spend is in its hold, against either counted signature.
  Every rule is checked before any page is fetched: the address must be https,
  at most 200 characters, and below one of the desk's registers, and the same
  page is read once against each signature. The challenger stakes a bond of 0.05
  GEN from bond credit (**`deposit`**, **`withdraw`**). Then one consensus block:
  every validator fetches the page (an error status or a failed fetch is a failed
  read that stores nothing and takes no bond), cuts the text to 32,000
  characters, collapses its spacing, keeps 8,000, takes the first 16 hex
  characters of its sha256, and asks two questions in two orders over the spend
  document the readings sealed, the member's disclosure as it stood when they
  countersigned, their public name, and the page, every one of them fenced and
  every block tagged with the start of its own sha256. The stored and compared
  value is `{"verdict": "hidden" | "clean" | "unclear", "fp": <16 hex>}`. After
  the round the fingerprint is checked too: a page text already read against
  that signature on that spend, reached through another address that serves the
  same text, is recorded as a **repeat** and settles nothing, so an unclear
  finding cannot be asked again through an alias until it comes back hidden.
- **Views**: `member` gains `public_name`, `stake`, `holds_open`, `hidden`,
  `cleared` and `retired`; `spend` gains `holding`, `hold_until`, the struck
  readings and the challenge count; `desk` gains the registers, the stake and the
  hold; `challenges_of(desk, spend, offset, limit)` pages the challenges twenty at
  a time; `bond_credit_of(addr)` and `stats()` are new; `rule()` carries the two
  questions word for word, the combine rule, the money table and the limits.
- **The Countersigned fixture** pays only on a spend the register reports paid
  with two counted `UU` readings; a spend open or in its hold is "call again
  later". It also refuses a paid spend whose counted reading the register reports
  as struck, or does not report on at all. The real register never produces that
  row (a strike reopens the spend, and a signature struck elsewhere in the run is
  dropped before the spend can hold or pay), so this is a guard against a
  register that misreports, and only a doctored register in the tests reaches it.

The two questions, each asked with the page first and with the documents first:

> **SHOWS** Does this page show that the person named {public_name} has a relation to the payee as the spend
> document describes it (owns, runs, directs, works for or is paid by it, or is close family of someone who does)
> that the member's filed disclosure does not mention? Answer yes, no or unclear.
>
> **SILENT** Does this page give the name of the person named {public_name}, and is it either silent about any
> relation between that person and that payee, or is every relation it shows between them one the member's filed
> disclosure already mentions? If the page does not give that name at all, answer no. Answer yes, no or unclear.

**hidden** only when SHOWS is yes in both orders and SILENT is no in both;
**clean** only when SHOWS is no in both and SILENT is yes in both; anything else,
an unreadable answer included, is **unclear**. SILENT is yes only for a page
that names the member, so **clean** means the page named the member and showed
nothing about the payee that their disclosure left out. A page that does not
name the member at all reads unclear and returns the bond: a member who enrols
under a name the registers do not use is not caught, but cannot turn accurate
challenges into bonds either.

| finding | the signature | the spend | the member's stake | the challenger's bond | the public record |
|---|---|---|---|---|---|
| hidden | struck, kept for the record, and standing refused for the rest of the run | its hold ends; back to open needing one more clear reading, or expired as version 1 would if its window has passed | slashed whole: half paid to the challenger in that transaction, half into the desk's pot | stays in the challenger's credit | `hidden` + 1 |
| clean | counted | still in its hold | untouched | paid to the member in that transaction: the page named the member and showed nothing they hid about the payee, so the accusation was wrong | `cleared` + 1 |
| unclear | counted | still in its hold | untouched | stays in the challenger's credit | nothing |
| repeat | counted | still in its hold | untouched | stays in the challenger's credit; the page text was already read against this signature | nothing |

When no funder holds credit in the desk at the moment of a hidden finding, the
desk's half would sit in a pot no unit stands for, and the next funder would take
it whole with a single atto; so in that case the whole stake goes to the
challenger.

### What changed on the site

The practice desk gains a second track, **catch a hidden conflict**, played on
the demonstration register in `registry/`: Mara Quist, a practice member who is
a director of the payee and never said so, reads clear, the spend goes into its
hold, and the visitor, with their own wallet, puts up bond credit and cites the
register's Gull Catering page against her signature. Every validator reads it,
the signature is struck and half her stake is paid to the visitor, in one
transaction. Before that the visitor may cite a page that names her only for the
print shop she filed (clean, the bond goes to her) and one that never names the
other signer (unclear, nothing moves). The spend page shows the hold, its
countdown, a panel to cite a page against either counted signature, every
challenge with its finding, page, fingerprint and money, struck readings struck
through, and a release button that anyone may press when the hold ends. Every
member has a page of their own with their public name, stake and public record,
where they restake, retire and take the stake back. The track waits for one
setting, `REGISTRY_COMMIT` in `web/lib/config.ts`, and says so until it is set;
"The site" below has the details.

### What changed in the evidence

- `registry/`: a fictional public companies register, the **Estuary Companies
  Register**, one plain-text page per company. `gull-catering-ltd.html` lists
  "Mara Quist, director, appointed 4 March 2019" for a caterer, a business no
  member's disclosure competes with; `heron-signs-ltd.html` lists nobody from
  the demonstration desk; `pelican-press-ltd.html` lists Mara Quist and her
  sister as the owners of the print shop of the version 1 story; and
  `osprey-paper-ltd-former-officers.html`, plainly labelled, shows a relation
  that ended in 2018. What each page reads as depends on the spend it is cited
  against; `registry/README.md` gives the table.
- `tests/on_chain/smoke.mjs` is rewritten for version 2: the register pages are
  read from `raw.githubusercontent.com` pinned to one commit, a wrong stake is
  refunded in the same transaction, a page that names a member only for what
  they disclosed is clean and pays its bond to the member, the caterer's page
  strikes the director who hid it and pays the whistleblower 0.25 GEN in the
  same transaction, the spend is carried by another member, a page that does not
  name the member cited against it is unclear and costs nothing, the spend is
  released, and every account ends where the money table says. The desk's hold
  is 45 minutes, and the script reads the spend before each challenge and sends
  none with less than five minutes of the hold left.
- The offline suite has 349 tests (298 in version 1), among them seeded random
  journeys through every write that check after every step that no atto is made
  or lost, and `tests/MUTATIONS.md` removes 389 defences in turn (282 in version
  1), each killed by a named test.

### The new limits, stated plainly

1. **Only the desk's named registers count, and only a relation one of them
   shows.** A relation that no named register prints is not caught, however
   real. The opener names the registers; a member who enrols accepts them, and
   `desk()` publishes them before anyone does (see 10).
2. **A name on a register page is the register's claim, matched against the
   public name the member gave.** The fund checks no identity. Two people can
   share a name, and a member who gives a public name the registers do not use
   cannot be matched; the public name is printed on the member's record for the
   other members to judge. Such a member is not caught, but cannot profit from
   it either: a page that does not give the member's public name reads unclear,
   so the challenger's bond goes back instead of to the member.
3. **The page must read the same for every validator at that moment.** A page
   that changes between fetches, answers some validators and not others, or
   rotates what it shows gets no agreement on its fingerprint, and nothing is
   stored. The demonstration register is pinned to a commit for that reason.
4. **Text pages only.** What an image, a PDF or a script would show is not read.
5. **A former relation is not a present one.** A page that shows only a relation
   that ended reads unclear by design, and the bond goes back.
6. **Every payment waits for the hold**, from 5 minutes to 7 days, and a struck
   spend needs another clear reading inside its window or it expires.
7. **A clean finding costs the challenger the bond; an unclear one costs
   nothing.** There is no cap on challenges, so none that a stranger could use
   up: each page address is read once against each signature, a page text
   already read against it under another address settles nothing, and a wrong
   accusation, one whose page names the member and shows nothing they hid, pays
   the member. A page whose text changes between readings is a new page.
8. **A stake is slashed whole, once.** A member struck on one spend whose
   signature is still counted on another spend to the same payee address in the
   same run is not slashed again: that signature stops counting when the other
   spend would next start a hold or be released, and that spend goes back to
   open. It is never paid on a struck signature.
9. **The desk's half of a slashed stake** raises the share of the funders in the
   desk when it arrives. If no funder holds credit then, there is nobody for it
   to belong to, so the challenger is paid the whole stake instead.
10. **The registers are the opener's choice.** Naming them in advance stops a
    challenger from citing a page they host; it does not stop the opener, or
    anyone who can publish under a named prefix, from deciding what those pages
    say. A desk whose registers its opener controls is a desk not to join.

## How it works

A **desk** holds money. Anyone opens one, names its roster once (or leaves it
empty for open enrolment), fixes the least notice a spend on it must give, the
public registers a challenge may cite, the stake each member puts up and the
length of the hold, and funds it.

A **member** enrols by filing a disclosure of their own interests: a statement
in their own words, one to six **entries** (a named counterparty or activity,
and the member's relation to it from a closed list of fifteen), and any
**addresses** they declare as their own, with a **public name** and exactly the
desk's **stake**. The contract stamps the disclosure with the next number of its
own event counter.

A member **posts a spend**: a payee address, an amount and a description. The
spend takes the next number of the same counter. The spends posted to one payee
address since the last one that was paid are one **run**, and the first posting
of a run fixes its **gate**: every later spend of the run keeps that number, the
readings in it that were not clear, and what its members said about the payee.
So the same payment posted again under a new number is the same question, not
a fresh one.

For the length of a **notice window**, which is never shorter than the desk's
minimum, any member but the poster whose disclosure predates the gate may add
one sentence saying who the payee is, and nobody may countersign. When the
notice window closes the document takes no more identifications, and from then
until the spend's window ends any member but its poster may countersign, once.

A countersignature is one call, `approve(desk, spend)`. It is either refused
before any model is asked, or read under consensus, and what follows from the
reading happens in that same transaction.

**Refused with no model asked.** Three refusals, each stored as a reading with
the value `--`, each spending the signer's one attempt on that spend, and none
costing a consensus round:

- **declared**: the payee is the signer's own address or an address they
  declared.
- **late**: the signer's disclosure, or its latest amendment, carries a higher
  number than the gate. Nobody can write or revise a disclosure after a payee
  address has been posted and then be read on a spend to that address, however
  often the payment is posted again, until a spend to it has been paid.
- **standing**: the signer was already read on an earlier spend of the same run
  and the reading was not clear. It stands, and it is not asked again.

**Read under consensus.** Otherwise the contract builds two documents from what
it holds and asks one question in both presentation orders, inside a single
consensus block: in which direction do this member's filed interests move if
the spend IS carried out, and in which direction if it is NOT. The stored value
is two characters, one per branch.

| character | meaning |
|---|---|
| `G` | something the member filed is better off under that branch |
| `L` | something the member filed is worse off under that branch |
| `U` | nothing the member filed is moved under that branch |
| `?` | both presentation orders answered that it is too vague to say |
| `/` | the two presentation orders answered with different directions |
| `x` | the answer could not be read in at least one of the two orders |
| `-` | no model was asked (written only by the contract) |

`UU` is **clear**. A `G` or an `L` in either position is **interested**: a
member who gains only if the spend fails is interested, and so is one who loses
only if it passes, and a direction settled under one branch stands whatever the
other branch came back as. Anything else, such as `?U` or `/U`, is **unclear**.

**What follows from the value, in the same transaction.** A reading that is not
clear is refused and stored with its two characters; the attempt is spent, the
verdict is final, and it stands for the rest of the run. The first clear reading
is counted. The second clear reading puts the spend in its **hold**: nothing is
paid and the amount stays committed. Until the hold ends anyone may cite a page
of one of the desk's registers against either counted signature, and a page that
every validator reads as showing a relation the member never disclosed strikes
that signature, slashes the member's stake and sends the spend back to open; the
struck member's signature also stops counting on any other spend of the same
run, when that spend would next start a hold or be released.
When the hold ends anyone may **release** the spend, which moves the amount from
the desk to the payee in that transaction and ends the run. A spend that does
not find two clear readings before its window ends is expired by anyone, and its
amount stops being committed. The bar is never lowered to one.

### Three things the contract does so that prose cannot get round it

**The judged spend is built by the contract.** The document the model reads is
assembled from stored fields: the spend number, the sequence number, the payee
address, the amount in atto and in whole GEN, the poster's member number and
address, the poster's description inside quotation marks the description cannot
close, and each member's identification of the payee under its author's number
and address, those made on earlier spends of the same run included. When nobody
has said who the payee is, the document says so in the contract's own words, and
when members were turned away because the four places were taken, it says how
many. `document(desk, spend)` returns those bytes and their sha256. Every judged
reading on that spend stores that digest; the three readings that ask no model
store none.

**Enrolment carries structure as well as prose.** A member who names nothing may
not countersign: at least one entry is required, its relation is one of fifteen
closed tokens that the contract prints as its own phrase, and an entry name made
only of words from a fixed list (`various`, `misc`, `business interests` and the
like) is refused at the door, with a message that says it is a word list and not
a judgement. A declared address that matches a payee is refused with no model
call at all.

**Sequence order is deterministic.** One counter numbers every event. An
amendment keeps the superseded version, takes a new number, and is therefore
newer than every spend already posted and than the gate of every run that is
live: the amender loses their say on those spends and on every later spend to
those payee addresses until one is paid, and keeps it on whatever is first
posted afterwards. Nothing in the contract lowers a number, rewrites a stored
version or deletes a row.

## Why this has to be on GenLayer

Whether a payment to a print shop moves the interests of a member who wrote
"I co-own Pelican Press with my sister" is a reading of two texts. No
deterministic rule answers it for texts nobody has seen yet, and a single
reader's answer is one party's opinion about another party's conflict. On
GenLayer several validators each make the reading themselves and the contract
stores it only when they reach the same two characters. Everything around that
reading (the money, the sequence numbers, the windows, the single attempt, the
three refusals that ask no model) is ordinary deterministic contract code. In
version 1 the payment was made in the same transaction as the second clear
reading. In version 2 that transaction latches the spend in its hold, with its
amount committed and its two signatures recorded, and the payment waits for
`release` after the hold: what the reading decided cannot be undone by anyone
but a register page the validators agree on, and nothing is paid that the hold
did not first leave open to challenge.

Version 2 adds the second thing only GenLayer can do: read the live web under
consensus. Whether a register page shows that the person named Mara Quist
directs the payee, when her disclosure never mentions it, is a reading of a page
nobody controls against a text the member wrote. Every validator fetches the
page itself and reaches the finding itself, and the contract strikes a
signature and moves a stake only when they agree on both the finding and the
fingerprint of what they read.

## How consensus is used

One `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` per countersignature, and
in version 2 one per challenge. The register round is described in the version 2
section above: one block, the page fetched by every node with its status read
first, two framings in two orders, `{"verdict", "fp"}` compared by exact
equality, and a leader whose fetch or model call failed never agreed with, so a
failed read stores nothing and takes no bond. What follows is the reading round
of a countersignature, unchanged from version 1.

- **Both framings in one block.** `leader_fn` asks the model twice. The two
  prompts carry the same instruction text and the same lines. In the first, the
  SPEND block precedes the INTERESTS block, QUESTION DONE precedes QUESTION
  NOT, and the member's entries and the identifications of the payee are printed
  in the order they were filed. In the second, each of those four groups is
  printed in the second order: an even number of things is reversed, and an odd
  number is reversed, rotated by one and its last two exchanged. So no block, no
  question, and no entry or identification where there are two or more of them,
  keeps its position, and every line keeps its own number. The order function is
  checked to have no fixed point at every size from 2 to 6, which is as many
  lines as any group can hold. Both prompts ask both branches, because branch
  and presentation order are separate things.
- **The leader resolves its own uncertainty before anything is compared.** Each
  branch's two answers become one character: the same readable word in both
  orders is that word's character, two readable but different words are `/`, an
  answer the contract cannot read is `x`, and UNCLEAR in both orders is `?`. A
  reader that leans on position, of a block or of a line inside one, therefore
  lands in the stored value as `/`.
- **Validators rerun the whole of `leader_fn`** inside `try/except` and compare
  the two characters by exact string equality. A validator whose own model
  fails disagrees. There is no tolerance: no two different values are ever
  accepted as the same.
- **No sentence a model wrote reaches storage.** The model returns two words
  from a closed set of four. The published sentence for each reading is
  composed by the contract from its own closed phrases.
- **A round no node could ask is not a verdict.** A round is a value only when
  both askings were answered. If the leader cannot reach a model for one of
  them, or for both, and the validators, rerunning the work, cannot either,
  nothing was read: the contract records a procedural refusal, the attempt is
  unspent and the document is not sealed.

`rule()` returns all of this in words, from the constants the code uses.

## Who calls it

- **The members of a fund**, to post spends and to countersign them.
- **Funders**, who put money into a desk and can take their share of whatever is
  not committed back out.
- **Anyone who can cite a register page**, member or stranger, while a spend is
  in its hold, with 0.05 GEN of bond credit; and anyone at all to release a spend
  whose hold has ended.
- **Other contracts**, which read `spend(desk, n)` and `reading(desk, n, addr)`
  through an ordinary view. `contracts/fixtures/countersigned.py` is one: a
  deposit that is released to a payee only against a spend the desk paid on two
  clear readings that no register page struck, bound at deposit to the payee
  address and to the digest of the judged document, and returned to the
  depositor otherwise.

## Who may do what

There is no operator and no privileged address. Every write checks its sender,
and the five that are open to anyone are listed with their reasons in a test.

| write | who may call it | the check |
|---|---|---|
| `open_desk` | anyone | open by design: the sender becomes the opener and a funder, names the roster and the desk's minimum notice once, and gets back whatever they sent on any refusal |
| `fund` | anyone | open by design: the credit is written under the sender's own address and `reclaim` pays that address only |
| `enrol` | an address on the roster, or anyone on an open desk, with exactly the desk's stake | the row is keyed by the sender; one per address per desk; every refusal returns the value |
| `restake` | the member | only the sender's own stake is topped up, with exactly what it is missing; every refusal returns the value |
| `retire` | the member | only the row keyed by the sender is marked, for good |
| `withdraw_stake` | a retired member | the stake paid is the sender's own, to the sender, once no spend it signed is open or in its hold |
| `amend` | the member | only the row keyed by the sender is rewritten |
| `post_spend` | a member of the desk | the sender must hold a disclosure on that desk and fewer than two open spends of their own; the payee may not be the sender |
| `identify` | a member, not the spend's poster, whose disclosure predates the gate | the sender's own row is read for its number; the poster is refused; one sentence per member per spend |
| `approve` | a member of the desk, not the spend's poster, once | sender enrolled, sender not the poster, no earlier reading by the sender on this spend, sender's own address not the payee, no reading of the sender's standing in this run |
| `expire` | anyone, after the window | open by design: the caller chooses nothing and no money leaves the desk |
| `reclaim` | a funder | the credit and the claims read, and the address paid, are the sender's own |
| `release` | anyone, after the hold | open by design: the payee and the amount were fixed at posting and the hold ran its length open to challenge |
| `deposit` | anyone | open by design: the bond credit is written under the sender's own address |
| `withdraw` | anyone with bond credit | the credit read and the address paid are the sender's own |
| `challenge` | anyone but the member challenged, while the spend is in its hold | the sender may not be the member; the bond is the sender's own credit |

Nobody is stuck. A recused member goes forward: they may amend, countersign
spends to other payees, and post the very payment they were recused on, which
two other members then carry. A member whose signature was struck restakes, or
retires and takes back what is left. A challenger takes back its credit. A spend
in its hold is released by anyone when the hold ends. A poster whose spend stalls waits for the window
and expires it, or anyone else does. A funder takes their share of the free
balance at any time; what their credit stood for in an open spend comes back to
them if the spend expires, and is their part of the payment if it is paid. A
stranger who cannot enrol on a full or rostered desk opens their own. A payee
does nothing.

## The limits, in full

1. **A disclosure is self-declared.** The contract cannot check it against the
   world, except where a register the desk named shows a relation it leaves out
   (version 2, with its own limits above). What it enforces is that the
   disclosure was on file first, that it names at least one thing, and that the
   reading is made against it as filed.
2. **Who the payee is, is only what members wrote.** A poster who does not name
   the payee, on a desk where nobody else knows the address, defeats the
   reading. The repair is in the other members' hands during the notice window,
   and the omission is visible in the judged document. The least that window
   may be is fixed by the opener when the desk is opened and published by
   `desk()`; the contract's own floor is five minutes, which is what a
   demonstration desk uses and is not notice anybody could rely on. A spend
   takes four identifications, first come. Four members can take the places
   with sentences that say little; the contract counts every member who was
   turned away and prints the count in the judged document, and that is all it
   does about it.
3. **An identification can be false, or hostile.** It is attributed and
   permanent, and the prompt discounts anything it says about the member being
   read or about the task, but a false sentence naming a business a member
   disclosed can get that member recused, and a sentence written to confuse can
   spoil readings. It is carried onto every later spend to that payee address
   until one is paid, and a reading it spoiled stands for as long, so posting
   the spend again is not a remedy. What is left: two other members can still
   carry the spend, the recused member may post it themselves, and a payment to
   that address ends the run.
4. **Open enrolment is for trying the contract, not for value.** The structural
   costs still apply (the poster is excluded, two others are needed, each must
   have enrolled before the payee was first posted, and there is a notice
   window), but they do not stop one person with three addresses. One person
   can also take all 20 member places of an open desk, and with four addresses
   all eight places for open spends.
5. **One attempt is one attempt, and a reading that is not clear stands.** An
   unstable or unreadable round spends the attempt, and so does agreed
   vagueness, and the reading then stands on every later spend to that payee
   address until one is paid. That is deliberate, since a verdict that can be
   asked again can be asked until it suits. It means a spend can stall on a bad
   round and expire, and a payee address can go unpaid on a desk for as long as
   too few of its members read clear.
6. **A run is kept per payee address.** The fund cannot know that two addresses
   are one payee. A payment posted to a second address starts a new run: its
   gate is its own number, no reading stands on it and nothing said about the
   first address is carried onto it, so a disclosure amended after the first
   address was seen is read against it. What was said and read on the first
   address stays on the record under that address.
7. **A payment ends the run.** After a spend to an address is paid, the next
   spend to it is a new question, read against the disclosures then on file: a
   member who amended in between is read on the amended version, and the
   superseded one stays in the history where anybody can see what was removed.
8. **A late disclosure stays late.** A member who enrols or amends after a
   payee address was first posted has no say on any spend to it until one is
   paid, and only members whose disclosures predate the run can countersign a
   spend to it. A desk on which too few of those read clear never pays that
   address. No money is
   trapped by that: each spend expires and its amount returns to the free
   balance.
9. **A broad honest discloser is recused often,** and a desk whose members are
   all close to its payees stalls. It never pays on one signature.
10. **Committed money waits, and a posted spend cannot be withdrawn.** A funder
    takes their share of the free balance at any time, and what their credit
    stood for in each open spend becomes a claim on that spend alone: void if
    the spend is paid, owed back if it expires. So leaving early neither escapes
    a payment nor moves any part of it onto the funders who stay, but what is
    committed is released only when the spend is paid or expires, a spend in its
    hold stays committed until it is released, and nobody can cancel a spend,
    its poster included. A member may hold two open spends
    and a desk eight, and members who keep the whole free balance committed
    delay every funder for as long as they keep posting. Money that arrives
    while a spend is open bears its share of that spend like any other credit
    in the desk.
11. **The refusal ring is a ring.** Procedural refusals are kept twelve to a
    ring, the oldest overwritten first. A desk's own ring is written only by
    addresses that hold a disclosure on that desk, so a stranger cannot turn
    it, but its members can: repeated refused calls push an earlier one out of
    the view (its transaction stays on the explorer). A poster's attempts to
    countersign their own spend are also counted on the spend itself, and
    readings, which are the record that matters, are never overwritten.
12. **Credit has a ceiling.** Funder credit is counted in units, kept as a
    decimal number of at most 600 digits. Every refill after a payment
    multiplies the units outstanding by the pot before the payment over the pot
    after it. A desk spent down to one percent and refilled takes 289 refills
    before the next one is refused and returned; a pot of 500 GEN drawn to its
    last atto each time takes 27. The funders can still reclaim, and a new desk
    needs nobody's permission.
13. **`desks()` is a page, not a directory.** Opening a desk is free, so the
    view shows the 20 most recent and a stranger can push any desk off it.
    `desks_from(n)` lists from any number, and every desk is read by its id.
14. **A member who names a claim on the fund itself is read unevenly.** A
    disclosure that says "my group asks this fund for money" is close to every
    spend. Across five sittings of the probe such a member read clear three
    times and unclear twice on a spend that had nothing to do with their group,
    and the last clear reading was carried by three validators against two. The
    prompt says that the size of the pot is an interest every member shares;
    the readers still hesitate, and the figures are in `DECISIONS.md`. Such a
    reading now stands for the run, so this member is refused on that payee
    address until a spend to it is paid.
15. **One instruction text is one way of reading.** The baseline that the
    branch where the spend is not carried out is read against the position as it
    stands, and not against the other branch, is the single most model dependent
    sentence in the design. It was measured before anything else and it held;
    see `DECISIONS.md`, which also says which wording each measurement ran.
16. **A conflicted member is refused, but is not always called interested.**
    Six readings set the part owner of a print shop against a spend that a
    member had identified as paying it. Four came back `GU`, one `G/` and one
    `/U`. All six were refused and no money moved, but `/U` has no settled
    direction in it, so that one is on the record as unclear: the two
    presentation orders did not give the same answer for the branch where the
    spend is carried out, and the contract stores that as what it is.

## What is in this repository

| path | what it is |
|---|---|
| `contracts/recused.py` | the contract |
| `contracts/fixtures/countersigned.py` | a second contract that pays against the first one's reading |
| `tests/test_pure.py` | the offline suite: a stub runtime and a simulated network with one scripted model per node |
| `tools/mutate.py` | removes each defence in turn and records the test that failed |
| `tests/MUTATIONS.md` | the table that tool writes; it refuses to write it if any mutant survives |
| `tests/on_chain/smoke.mjs` | the version 2 run against GenLayer Studio, with throwaway accounts and the register read at one commit |
| `tests/on_chain.md` | every step of the version 1 run, with its transaction and tally |
| `registry/` | the Estuary Companies Register, a fictional public register whose pages the version 2 run cites |
| `docs/DESIGN.md` | the specification the contract was built to, with its corrections |
| `DECISIONS.md` | each choice, its reason and its cost, and what was measured |
| `CONTRACTS.md` | the method by method reference |
| `requirements-dev.txt`, `pytest.ini` | the pinned tools of the offline suite |
| `package.json`, `package-lock.json` | the pinned dependencies of the on-chain run; the contracts need none of them |
| `web/` | the site: a Next.js app that reads and writes this contract and nothing else |

## The site

`web/` is the product a visitor uses: the desks and their members, filing a
disclosure, posting a spend, the page of one spend with the document the
contract built and every reading of it, and a ledger anyone can read with no
wallet. It also serves a byte copy of `contracts/recused.py`, so anyone may
deploy a register of their own from the same source.

A spend needs three distinct members, the one who posts it and two who
countersign, and a disclosure must be older than the spend it is read against.
So a newcomer who has just enrolled can countersign nothing that already exists,
and alone would only ever meet the refusal for a late disclosure. The **practice
desk** answers that without an operator: the page makes practice accounts in the
visitor's own browser, funds them from the test faucet, and has them play the
other members of a new desk, and it says plainly which accounts are its own. It
has two tracks, and every step of both is a transaction on GenLayer Studio.

**Be read and paid.** The visitor enrols with their own wallet, under a public
name and with the desk's stake of 0.1 GEN, a practice member posts a spend after
that, the visitor countersigns it and is read by a real consensus round, a
second practice member's clear reading puts the spend in its five-minute hold,
and when the hold ends a practice member releases it and the payee is paid. One
more click shows the contrast: a spend to the print shop, countersigned by the
member who part owns it, refused. The visitor takes the stake back from their
member page once the spend they signed has ended.

**Catch a hidden conflict** (version 2). Four practice accounts open a desk whose
one register is `registry/` on `raw.githubusercontent.com` at the commit set as
`REGISTRY_COMMIT` in `web/lib/config.ts`, each enrol with a stake of 1 GEN, and
post 0.4 GEN of refreshments from Gull Catering Ltd. Mara Quist and Tomas Brandt
read clear and the spend goes into a 30-minute hold. The visitor, with their own
wallet, deposits bond credit and cites the Gull Catering page against Mara's
signature: every validator fetches it, finds the directorship her disclosure
left out, strikes the signature and pays the visitor 0.5 GEN of her stake in that
transaction, and the page watches the visitor's balance until it arrives. A
desk names its registers for good when it is opened, so the track will not open
a desk on a branch that could change: until `REGISTRY_COMMIT` holds the commit
`registry/` was pushed in, the track says why it cannot start. Demo mode runs it
on the in-memory contract, where the page is served from a copy of `registry/`
and judged by a fixed rule, and the demo bar says so.

Version 2 shows on every page: the desk page lists the desk's registers as
links, its stake and its hold, and each member's public name, stake and record;
opening a desk takes the registers, the stake and the hold, each with
suggestions; enrolling takes the public name and sends the stake; every waiting
moment (a hold, a challenge with the validators, a struck signature, a release,
a stake to restake, a retired member) says what is happening, how long it takes,
whether anything is needed, whether the visitor can leave, and where the money
is. A register still running version 1 is read as such, and the pages say that
its version 2 calls need a version 2 register.

```
cd web
npm ci
NEXT_PUBLIC_MOCK=1 ./node_modules/.bin/next dev -p 3117                # in-memory data, no wallet needed
node --import ./tests/unit/ts-resolve.mjs --test tests/unit/*.test.mjs  # the site's unit tests, no network
node tests/site/practice.mjs && node tests/site/catch.mjs              # both tracks in headless Chrome, against :3117
./node_modules/.bin/next build .
```

The unit tests check every call and view against `contracts/recused.py`, walk the
in-memory contract through every version 2 path, run seeded random journeys that
count every atto after every step, and check the waiting copy for every state and
role, the suggestions against the contract's limits, both practice tracks' order,
and that nothing personal is in the site's files.

## Running it

```
pip install -r requirements-dev.txt
python -m pytest tests/ -q -p no:cacheprovider      # 349 tests, no network
genvm-lint check contracts/recused.py               # read the first line and the exit code
genvm-lint check contracts/fixtures/countersigned.py
python tools/mutate.py                              # 389 defences, exit 1 on a survivor
```

The on-chain run needs Node:

```
npm ci
COMMIT=<sha> node tests/on_chain/smoke.mjs             # the whole version 2 run, phases A to F
COMMIT=<sha> RESUME=1 node tests/on_chain/smoke.mjs    # continue a run that was cut off, from the saved state
```

`COMMIT` is the commit `registry/` was pushed in: the validators read the
register pages from `raw.githubusercontent.com` at that commit, and the runner
refuses to start until those pages are byte for byte the files in this checkout.
It deploys its own copies with accounts it generates and funds from the Studio
faucet, and never touches a wallet of anybody's own. Every step is saved as it
is made, so a run that is cut off continues without sending anything twice. The
run takes under an hour, because the notice window, two holds and the expiry
windows are real and every transaction is waited on until it is final. The
version 1 runner, with its probe, is `tests/on_chain/smoke.mjs` at commit
`f628a69`.

## Network

GenLayer Studio, chain 61999, RPC `https://studio.genlayer.com/api`, explorer
`https://explorer-studio.genlayer.com`. Runner
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.

## Evidence for version 1

Run on 3 October 2026 on GenLayer Studio (chain 61999), from start to finish in one sitting of 106 minutes:
88 transactions in 88 steps, none sent a second time, and 114 of 114 checks true. Register
[`0x92cF8772718B76b765ba933dd9C97F447E65d219`](https://explorer-studio.genlayer.com/address/0x92cF8772718B76b765ba933dd9C97F447E65d219), Countersigned fixture [`0x6E14ccFbcA93A206d1752052880B746d99473B3d`](https://explorer-studio.genlayer.com/address/0x6E14ccFbcA93A206d1752052880B746d99473B3d).
`gen_getContractCode` returns bytes identical to `contracts/recused.py` (sha256
`7e5656df522e31c0d3f0498787cba13de0ea4a88273b5675a9809b46b1087339`) and `contracts/fixtures/countersigned.py` (sha256
`e94b263acad6e85ed6c1a2009c1eee2d6e25a2fa623c0657ec21ef8d58923844`).

The accounts were generated by the runner and funded from the Studio faucet; none is anybody's wallet. Four play
the story on desk D1: **A** `0x7E32Dd332d8F2A79EfBEAa9bAc5bAF8Db5a098c8` opens the desk and keeps the association's minutes, **B**
`0xC035A91eb3352b62EE17ac0539659E97cD0996b7` part owns the print shop, **C** `0x296bfDFcf7BF91550aC3d3CBA3b7c77C96e71Fac` chairs the bike group, **D**
`0x29e98d51097d9b1C9eB467323F176b42ceF00377` teaches at the school. One step needs more members than four, a spend that takes four
identifications and turns a fifth member away, so a second desk brings in **E** and **F** for that step alone.
Three more addresses are payees and never sign: the print shop, the bike group and the hall.

The rows where a reading was stored, money moved or a payable call was refused:

| step | who | call | transaction | votes | result |
|---|---|---|---|---|---|
| deploy | A | deploy recused.py | [0x01e87c3b…](https://explorer-studio.genlayer.com/tx/0x01e87c3b947e3560e570b72b9a38a153f443cf871f31e0e32384769ba00be24c) | 3 agree, 2 idle | deployed at `0x92cF8772718B76b765ba933dd9C97F447E65d219` |
| a1 | A | `open_desk(no, , 5)` with 3 GEN | [0x911b3161…](https://explorer-studio.genlayer.com/tx/0x911b3161a11b6cc2f52ff5376c282d167e09fad7de2ffde889245fdef8c613ca) | 3 agree, 2 idle | refused and stored: the desk's name is 4 to 60 characters; 3 GEN came back in the same transaction |
| a2 | A | `open_desk(Pelican Street mutual fund, , 4)` with 3 GEN | [0x1d5880f3…](https://explorer-studio.genlayer.com/tx/0x1d5880f3866ab72ae8e4897bbc311731a52c8080d5f425a1bb2e731306a11aaa) | 3 agree, 2 idle | refused and stored: the desk's minimum notice is 5 to 1440 minutes; it is fixed here and no spend on this desk may give its members less time to say who a payee is; 3 GEN came back in the same transaction |
| a4 | B | `fund(D7)` with 2 GEN | [0x3a972923…](https://explorer-studio.genlayer.com/tx/0x3a97292346509b72b41c729affe9dfb6e48c08585588a79e55db9342836f176c) | 3 agree, 2 idle | refused and stored: no desk D7; 2 GEN came back in the same transaction |
| a8 | D | `approve(D1, 1)` | [0x2c0de03d…](https://explorer-studio.genlayer.com/tx/0x2c0de03d48958a1d222deb657421e3e4cdfd11f162a3652a5623b3d5fb0f9b3e) | 3 agree, 2 idle | refused and stored: no spend S1 on D1 |
| b2 | B | `approve(D1, 1)` | [0x7e85ad3c…](https://explorer-studio.genlayer.com/tx/0x7e85ad3c246b0613d63e5f9d62779692c8476de6f08e6645a668923c9da56540) | 3 agree, 2 idle | refused and stored: the notice window of S1 runs to 1791018397; until then any member but the poster whose disclosure predates the spend may identify the payee, and nobod |
| c1 | B | `approve(D1, 1)` | [0xa2dee4af…](https://explorer-studio.genlayer.com/tx/0xa2dee4af422332644fc6711c7083558f4d72d7d53545b3fe7992e3e67208ff51) | 3 agree, 1 disagree, 1 idle | **interested**, stored value `GU`, not counted |
| c2 | C | `approve(D1, 1)` | [0x3a743714…](https://explorer-studio.genlayer.com/tx/0x3a74371473901883e97ea0927648f1335d93b7eb43d57b873bf4395bf618c2fb) | 5 agree | refused and stored: the member who posted S1 may never countersign it |
| c3 | A | `approve(D1, 1)` | [0x5d86b979…](https://explorer-studio.genlayer.com/tx/0x5d86b97980d6b52f049022ef80b2bb5d3eca5121bc6e9817cae562bce8444c2e) | 3 agree, 2 idle | **clear**, stored value `UU`, counted 1 of 2 |
| c4 | D | `approve(D1, 1)` | [0x55312606…](https://explorer-studio.genlayer.com/tx/0x553126068a5c64807d5bd89009e168763c4006dc976104dbe42c3ed14146b3a6) | 3 agree, 2 idle | **clear**, stored value `UU`, counted 2 of 2; **180 GEN paid to the print shop in this transaction** |
| c5 | B | `approve(D1, 2)` | [0xe768be12…](https://explorer-studio.genlayer.com/tx/0xe768be120e44e2c65dfff102a0651a013a6bd613cd35a3fd207175ff9c20c97c) | 3 agree, 2 idle | **clear**, stored value `UU`, counted 1 of 2 |
| c6 | D | `approve(D1, 2)` | [0x498e62e6…](https://explorer-studio.genlayer.com/tx/0x498e62e6461b607b5f433b6f2f20bb415dfb7d97cf57d96015be592fdc2e411b) | 3 agree, 2 idle | **clear**, stored value `UU`, counted 2 of 2; **60 GEN paid to the bike group in this transaction** |
| c7 | B | `approve(D1, 3)` | [0x7701c480…](https://explorer-studio.genlayer.com/tx/0x7701c4807a89aaac6a8d278d4e25e6e66dccb9e717cc90875c3fae556fea4973) | 2 agree, 1 disagree | **clear**, stored value `UU`, counted 1 of 2 |
| d4 | B | `approve(D1, 3)` | [0x652892f7…](https://explorer-studio.genlayer.com/tx/0x652892f749eb674a71d3973e9236c6e132752b9e68f420f08f00e380f735a15f) | 3 agree, 2 idle | refused and stored: this address already has a reading on S3; one attempt per member per spend, and a verdict is final |
| d5 | C | `approve(D1, 3)` | [0xec617ac9…](https://explorer-studio.genlayer.com/tx/0xec617ac941b8f2a3e89dde49de05aeb639f6e56b71400618a78b99e3941dde6c) | 3 agree, 2 idle | **declared**, stored value `--`, not counted |
| d6 | A | `approve(D1, 3)` | [0x8cb5f106…](https://explorer-studio.genlayer.com/tx/0x8cb5f10609708a6fb28bb2798b89af2d2e9cee4dfd5c632d30feec21b880607e) | 3 agree, 2 idle | refused and stored: the member who posted S3 may never countersign it |
| d7 | D | `approve(D1, 3)` | [0xd127c818…](https://explorer-studio.genlayer.com/tx/0xd127c8183d1851afcf76fa9e2a7cd033346047ac268df0daeb7b7924c0e546a1) | 3 agree, 2 idle | **late**, stored value `--`, not counted |
| e1 | D | `approve(D1, 4)` | [0xfd9bd76a…](https://explorer-studio.genlayer.com/tx/0xfd9bd76a7ed5f937b227d0ca03e561707ba61b2d43bb3291b5e6f7fccdfb08fc) | 3 agree, 1 disagree, 1 idle | **unclear**, stored value `?/`, not counted |
| e5 | B | `approve(D1, 5)` | [0x1e4e3615…](https://explorer-studio.genlayer.com/tx/0x1e4e3615e0d169e503589b1306f567618a7ff773b20939273214314db46dc2ef) | 5 agree | **late**, stored value `--`, not counted |
| e6 | D | `approve(D1, 5)` | [0xd1de9a06…](https://explorer-studio.genlayer.com/tx/0xd1de9a0651ca97af84205f7375ee08e461ab0af194ef6eaa43dc7f8e6f849171) | 4 agree, 1 idle | **standing**, stored value `--`, not counted; it stands on the reading made on S4 |
| e7 | B | `expire(D1, 3)` | [0x026c60c1…](https://explorer-studio.genlayer.com/tx/0x026c60c1b9916178ab992abd2952821170245c8c4013cb68fbc6b9eb3be9db4f) | 5 agree | refused: the window of S3 runs to 1791023404, another 2528 seconds |
| deployF | C | deploy countersigned.py | [0x19e2fd50…](https://explorer-studio.genlayer.com/tx/0x19e2fd509e293c87bac4b8f44698a46fad8218801f24ac6e75ea0f30181b4fff) | 3 agree, 2 idle | deployed at `0x6E14ccFbcA93A206d1752052880B746d99473B3d` |
| f2 | C | `deposit(D1, 2, the bike group, 489b1e847431ab44965deea05fc2ae…)` with 2 GEN | [0xc2242d15…](https://explorer-studio.genlayer.com/tx/0xc2242d1513f3e830378f13b7d1b478a8ed2e59b2e938eed028b79dc5fd06f53f) | 5 agree | refused and stored: this address already has a live deposit on D1 S2 as deposit 1; 2 GEN came back in the same transaction |
| f3 | B | `deposit(D1, 2, the bike group, not a digest)` with 2 GEN | [0xdafe4169…](https://explorer-studio.genlayer.com/tx/0xdafe416951d8aa8c678306cf394032f200cba74d06ca0896ddfddb34a86c79eb) | 4 agree, 1 idle | refused and stored: the document digest is 64 hexadecimal characters, the sha256 the register's document(desk, spend) view publishes; 2 GEN came back in the same transaction |
| f4 | D | `release(1)` | [0xc9c705b8…](https://explorer-studio.genlayer.com/tx/0xc9c705b8701dec1cc500ae32392a2263fe47f887d56fae9aab0931e0efa5db4c) | 3 agree, 2 idle | deposit 1, state released |
| f5 | D | `release(1)` | [0xf48a89ed…](https://explorer-studio.genlayer.com/tx/0xf48a89ed54f664fc8048fec90eff30f0b06287777681ee3ab67b9a7e948f5f04) | 3 agree, 2 idle | refused: deposit 1 is already released |
| f7 | B | `release(2)` | [0x82cd2078…](https://explorer-studio.genlayer.com/tx/0x82cd207819b5e7ea62ae7511e02431f81404b19ae6404cfe05d775c0d4ce7e98) | 3 agree, 2 idle | refused and stored: the register paid 0x4bc9dff0aca76c7e5990513a1eb7d539155d7c11, not the payee this deposit was bound to |
| f9 | D | `release(3)` | [0xf26abfe3…](https://explorer-studio.genlayer.com/tx/0xf26abfe3f094696c2f463c5a0a89160107e5d415476f3326c21a8aeec4cc62ce) | 4 agree, 1 idle | refused: S3 on D1 is still open; nothing is settled before the desk carries it or its window ends |
| g15 | D | `approve(D2, 1)` | [0x7531be99…](https://explorer-studio.genlayer.com/tx/0x7531be99ec3bcb6b352a064e901570ba81e5ae45e3069b4b0ff1ec6641219c7e) | 3 agree, 1 disagree, 1 idle | **clear**, stored value `UU`, counted 1 of 2 |
| h1 | B | `expire(D1, 4)` | [0x699fd720…](https://explorer-studio.genlayer.com/tx/0x699fd720191a9eae430673954bf70fde61fd676317b49ac46f76235f09de4f71) | 5 agree | spend S4 expired |
| h2 | D | `expire(D1, 5)` | [0x26b7b194…](https://explorer-studio.genlayer.com/tx/0x26b7b194b16f87b72e2f6425f44f1f6081012e89d592b227f81ce7513ba1c9ae) | 5 agree | spend S5 expired |
| h3 | A | `reclaim(D1)` | [0xf04ce2a4…](https://explorer-studio.genlayer.com/tx/0xf04ce2a44b58103048105bf864165429d84be8e9f5c1224222ae7a507e49b9b9) | 3 agree, 2 idle | 240 GEN taken back |
| h4 | A | `reclaim(D1)` | [0x07e54fb6…](https://explorer-studio.genlayer.com/tx/0x07e54fb67d854601d6d89c6aa235aa8bbf2f39e078e7a3dd914640927b3104b6) | 5 agree | refused: D1 holds 280000000000000000000 atto with 40000000000000000000 committed to open spends and 0 owed on spends that expired, against 500000000000000000000 units of credit, s |
| h5 | D | `expire(D1, 3)` | [0x3552679b…](https://explorer-studio.genlayer.com/tx/0x3552679bcdf8f6a788276bf5b7c64df1e755027a422de1fba99c915d4bfdf0a2) | 5 agree | spend S3 expired |
| h6 | B | `expire(D1, 3)` | [0xb173331d…](https://explorer-studio.genlayer.com/tx/0xb173331d136ca8ad84591522cf7a8743524f01f5b0c077fb14434cf760cf2b5c) | 5 agree | refused: S3 is already expired |
| h7 | A | `reclaim(D1)` | [0xf1665920…](https://explorer-studio.genlayer.com/tx/0xf16659205469d97aeed542e3e62593b5c5bba946a8cb60ae5d38cd5b534f1dbb) | 5 agree | 20 GEN taken back |
| h8 | D | `reclaim(D1)` | [0x383de276…](https://explorer-studio.genlayer.com/tx/0x383de27665a55087da9accef78aad10417a1b9f1c7d6fe43815970b3c9d2afc3) | 3 agree, 2 idle | 260 GEN taken back |
| h9 | C | `reclaim(D1)` | [0xe74a3e78…](https://explorer-studio.genlayer.com/tx/0xe74a3e78f946b46b07d4ad6bb87731a0ec26d529d5fa19dd36b5ec562fce37ed) | 5 agree | refused: this address has no funder credit on D1 |
| h10 | B | `release(3)` | [0x26c8ad74…](https://explorer-studio.genlayer.com/tx/0x26c8ad7405d95e6d76f5b748738c0dbfd79cb3c899c6be4a7a178c0d7d43cb28) | 3 agree, 2 idle | refused and stored: S3 expired without two clear countersignatures |
| h12 | D | `release(4)` | [0x71aa6e6c…](https://explorer-studio.genlayer.com/tx/0x71aa6e6cb893c5f6373b03ef556ffb2af0913a86f9cccfdc9ff4a0737bb284df) | 4 agree, 1 idle | refused: the register has no D1 S9; the depositor may cancel |
| h15 | B | `expire(D2, 1)` | [0x780fcda2…](https://explorer-studio.genlayer.com/tx/0x780fcda2b443cf9ffc9e04b2ea05842248417dc4aa40269cb78239ecb693b6df) | 5 agree | spend S1 expired |
| h16 | A | `reclaim(D2)` | [0x58500393…](https://explorer-studio.genlayer.com/tx/0x5850039359b17b76e63568474532beccf4d3f6306a8a38036fb28bc7117015d3) | 3 agree, 2 idle | 2 GEN taken back |

Read back from the register afterwards: all six verdicts were written (clear, interested, unclear, declared,
late, standing); S1 and S2 are paid and S3, S4 and S5 expired; the print shop holds 180 GEN and the bike group 85;
desk D1 has nothing left in it and four members, two of them at version 2 with later disclosure numbers; the
reading that stands names the spend it was made on; the fixture holds four deposits, one released, one refused,
one returned and one cancelled. Over the run A is 240 GEN down, which is what the desk paid out while only A's
money was in it, and B and D are level.

Every one of the 88 steps, with its transaction and tally, is in [tests/on_chain.md](tests/on_chain.md). That
run was made by the version 1 runner, `tests/on_chain/smoke.mjs` at commit `f628a69`. The other half of the
evidence was offline: 298 tests with no network, and a mutation table where each of 282 defences was removed in
turn and a test failed for every one.

The site's practice desk was also run for real against a copy of these bytes: a visitor with one wallet enrolled,
was read `UU` and counted, the second clear reading paid 0.2 GEN in that transaction, and the member who part owns
the print shop was read `GU` and refused on a spend that paid it.

## Evidence for version 2

The on-chain run is recorded here once it has run.

## Licence

MIT. See `LICENSE`.
