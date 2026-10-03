# Recused

A shared fund where a spend needs two countersignatures, and the contract
refuses a countersignature when the interests the signer filed **before the
spend existed** are moved by it, in either direction, whether the spend goes
through or not. Its limits belong here, before anything else. The contract reads
what a member filed and cannot know what they hid: a member who leaves something
out in good faith reads clear, and so does one who files a false statement in
bad faith. A desk with open enrolment is not safe for money that matters,
because three addresses one person controls can post a spend and carry it; a
desk holding real money names its members when it is opened. A member who
discloses broadly and honestly will be recused often. A sentence saying who a
payee is, is a member's signed claim and may be false, and a false one can
recuse an honest member for as long as that payee address goes unpaid. "Before"
is kept per payee address, and the fund cannot know that two addresses are one
payee. What the contract means by "clear" is exactly three things and no more:
not the poster, not paid at an address that is the signer's own or that they
declared, and not moved under either branch as read against what they filed
first.

## How it works

A **desk** holds money. Anyone opens one, names its roster once (or leaves it
empty for open enrolment), fixes the least notice a spend on it must give, and
funds it.

A **member** enrols by filing a disclosure of their own interests: a statement
in their own words, one to six **entries** (a named counterparty or activity,
and the member's relation to it from a closed list of fifteen), and any
**addresses** they declare as their own. The contract stamps the disclosure with
the next number of its own event counter.

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
is counted. The second clear reading latches the spend paid, moves the amount
from the desk to the payee in that same transaction, and ends the run. A spend
that does not find two clear readings before its window ends is expired by
anyone, and its amount stops being committed. The bar is never lowered to one.

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
three refusals that ask no model) is ordinary deterministic contract code, in
the same transaction as the reading, so the verdict and its consequence cannot
come apart.

## How consensus is used

One `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` per countersignature.

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
- **Other contracts**, which read `spend(desk, n)` and `reading(desk, n, addr)`
  through an ordinary view. `contracts/fixtures/countersigned.py` is one: a
  deposit that is released to a payee only against a spend the desk carried with
  two clear readings, bound at deposit to the payee address and to the digest of
  the judged document, and returned to the depositor otherwise.

## Who may do what

There is no operator and no privileged address. Every write checks its sender,
and the three that are open to anyone are listed with their reasons in a test.

| write | who may call it | the check |
|---|---|---|
| `open_desk` | anyone | open by design: the sender becomes the opener and a funder, names the roster and the desk's minimum notice once, and gets back whatever they sent on any refusal |
| `fund` | anyone | open by design: the credit is written under the sender's own address and `reclaim` pays that address only |
| `enrol` | an address on the roster, or anyone on an open desk | the row is keyed by the sender; one per address per desk |
| `amend` | the member | only the row keyed by the sender is rewritten |
| `post_spend` | a member of the desk | the sender must hold a disclosure on that desk and fewer than two open spends of their own; the payee may not be the sender |
| `identify` | a member, not the spend's poster, whose disclosure predates the gate | the sender's own row is read for its number; the poster is refused; one sentence per member per spend |
| `approve` | a member of the desk, not the spend's poster, once | sender enrolled, sender not the poster, no earlier reading by the sender on this spend, sender's own address not the payee, no reading of the sender's standing in this run |
| `expire` | anyone, after the window | open by design: the caller chooses nothing and no money leaves the desk |
| `reclaim` | a funder | the credit and the claims read, and the address paid, are the sender's own |

Nobody is stuck. A recused member goes forward: they may amend, countersign
spends to other payees, and post the very payment they were recused on, which
two other members then carry. A poster whose spend stalls waits for the window
and expires it, or anyone else does. A funder takes their share of the free
balance at any time; what their credit stood for in an open spend comes back to
them if the spend expires, and is their part of the payment if it is paid. A
stranger who cannot enrol on a full or rostered desk opens their own. A payee
does nothing.

## The limits, in full

1. **A disclosure is self-declared.** The contract cannot check it against the
   world. What it enforces is that the disclosure was on file first, that it
   names at least one thing, and that the reading is made against it as filed.
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
   can also take all 24 member places of an open desk, and with four addresses
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
    committed is released only when the spend is carried or expires, and nobody
    can cancel a spend, its poster included. A member may hold two open spends
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
    view shows the 24 most recent and a stranger can push any desk off it.
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
| `tests/on_chain/smoke.mjs` | the run against GenLayer Studio, with throwaway accounts |
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
other members of a new desk. The visitor enrols with their own wallet, a
practice member posts a spend after that, the visitor countersigns it and is
read by a real consensus round, and a second practice member's clear reading
pays the payee in that transaction. One more click shows the contrast: a spend
to the print shop, countersigned by the member who part owns it, refused.
Every one of those steps is a transaction on GenLayer Studio, and the page says
plainly which accounts are its own.

```
cd web
npm ci
NEXT_PUBLIC_MOCK=1 ./node_modules/.bin/next dev -p 3127   # in-memory data, no wallet needed
./node_modules/.bin/next build .
```

## Running it

```
pip install -r requirements-dev.txt
python -m pytest tests/ -q -p no:cacheprovider      # 298 tests, no network
genvm-lint check contracts/recused.py               # read the first line and the exit code
genvm-lint check contracts/fixtures/countersigned.py
python tools/mutate.py                              # 282 defences, exit 1 on a survivor
```

The on-chain run needs Node:

```
npm ci
PHASE=P node tests/on_chain/smoke.mjs      # the probe: one spend and three readings, about a quarter of an hour
node tests/on_chain/smoke.mjs              # the whole run, phases A to I
RESUME=1 node tests/on_chain/smoke.mjs     # continue a run that was cut off, from the saved state
```

It deploys its own copies with accounts it generates and funds from the Studio
faucet, and never touches a wallet of anybody's own. Every step is saved as it
is made, so a run that is cut off continues without sending anything twice. The
full run takes about two hours, because the notice windows and the expiry
windows are real and every transaction is waited on until it is final.

## Network

GenLayer Studio, chain 61999, RPC `https://studio.genlayer.com/api`, explorer
`https://explorer-studio.genlayer.com`. Runner
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.

## Evidence

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

Every one of the 88 steps, with its transaction and tally, is in [tests/on_chain.md](tests/on_chain.md). The
other half of the evidence is offline: 298 tests with no network, and `tests/MUTATIONS.md`, where each of 282
defences is removed in turn and a test fails for every one.

The site's practice desk was also run for real against a copy of these bytes: a visitor with one wallet enrolled,
was read `UU` and counted, the second clear reading paid 0.2 GEN in that transaction, and the member who part owns
the print shop was read `GU` and refused on a spend that paid it.

## Licence

MIT. See `LICENSE`.
