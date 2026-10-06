# The role guides

One short guide per role, instead of one handbook for everybody.

`../LCM Finance Handbook.docx` describes the whole system. That is the right
document for somebody who has to understand how the church's money moves, and
the wrong one to hand a pastor who wants to claim for petrol: they would read
fifteen sections to find the two that are theirs.

So the same material is cut by role. Each guide answers only what that person
does, and says it in the order they will do it: get in, find the thing, do it.

## Building them

```bash
python docs/guides/build.py          # all of them
python docs/guides/build.py exco     # one, while writing it
```

Each run writes `<role>.html` here and a Word version beside it. The HTML is
self-contained — fonts and pictures embedded, no external requests — so it can
be emailed on its own, opened on a phone, and printed to PDF from the browser.

PDFs are not committed: `docs/*.pdf` is ignored on purpose, and the rule exists
to make sure a payroll export can never be added by accident. Print one when
you need one.

## Where the content lives

`content.py`, as a list of sections, each naming the roles it belongs to. A
section shared by everybody — getting in, signing in — is written once there
and appears in all ten guides. That is the whole point of generating them: the
sign-in instructions cannot drift between the pastor's copy and the Treasurer's.

## The pictures

From `../img/`, the same folder the handbook uses, embedded by
`../inline-images.py`. A picture named in `content.py` that is not in that
folder leaves a labelled placeholder in the guide rather than failing the
build — so a guide can be written before its screenshot has been taken, and
the gap is visible on the page.

`../img/README.md` describes how the existing ones were captured, including
how to photograph a page that sits behind the login without faking a session.
