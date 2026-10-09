"""What goes in each role guide.

Two tables. GUIDES names the ten guides; SECTIONS holds the writing, each
section naming the roles it belongs to.

Written once, appearing in several guides, is the point. Signing in is the same
act for a pastor and for the Treasurer, and a handbook per role would mean ten
descriptions of it drifting apart one correction at a time.

The voice is the handbook's: say what to do, in the order it is done, and say
plainly where a rule has an exception rather than leaving it to be discovered.
Each guide is read by somebody who wants to finish one task and close the tab.
"""

# ── Who gets a guide ───────────────────────────────────────────────────────
EVERYONE = [
    "exco", "pastor", "checker", "staff", "admin",
    "gm", "signatory", "finance", "accounts", "building",
]

#: Those the church employs, who therefore have leave, a payslip and claims.
EMPLOYED = ["pastor", "staff", "admin", "gm", "signatory", "finance", "accounts", "building"]

GUIDES = {
    "exco": dict(
        title="For an EXCO Member",
        covers="asking for a payment, verifying your ministry's spending, and your ministry's budget",
    ),
    "pastor": dict(
        title="For a Pastor",
        covers="claiming money back, applying for leave, and approving leave for the pastors under you",
    ),
    "checker": dict(
        title="For a Checker",
        covers="checking that a voucher&rsquo;s particulars are right before the EXCO Member verifies it",
    ),
    "staff": dict(
        title="For Office Staff",
        covers="claiming money back, applying for leave, and your payslips",
    ),
    "admin": dict(
        title="For the Admin Executive",
        covers="the church&rsquo;s records &mdash; the directory, congregations and offices &mdash; alongside your own claims and leave",
    ),
    "gm": dict(
        title="For the General Manager",
        covers="verifying payments, approving leave, and the whole church&rsquo;s budget",
    ),
    "signatory": dict(
        title="For a Signing Officer",
        covers="signing payment vouchers, and the budget line behind each one",
    ),
    "finance": dict(
        title="For the Finance Executive",
        covers="reviewing vouchers, raising them from the GM&rsquo;s instructions, and the figures behind the budget",
    ),
    "accounts": dict(
        title="For the Accounts Executive",
        covers="recording payments, keeping the reference series, and payroll",
    ),
    "building": dict(
        title="For the Building &amp; Event Manager",
        covers="building and event vouchers, worksheets, bookings and facility income",
    ),
}


# ── The writing ────────────────────────────────────────────────────────────
#
# Each section: where it sits in a guide, an id for the link, a title, the
# roles it belongs to, and the
# body in the handbook's own markup — which is what lets the Word converter
# turn it into real Word headings, lists and shaded panels rather than a wall
# of text. The vocabulary it understands: h3, p, p.lede, figure.shot,
# ol.steps, ul.callouts, ul.chips, div.note-box, table.
#
# `rank` orders a guide, because the order that reads well is not the order
# these are written in. A signing officer is given signing before claiming: the
# job they hold comes before the things everybody does, or their own work ends
# up seventh in their own guide.
#
#   0  getting in at all        2  what everybody does
#   1  the job this person holds 3  when something is wrong

SECTIONS = [

    dict(rank=0, id="getting-in", title="Getting in", roles=EVERYONE, body="""
        <p style="text-align:center;margin:.2rem 0 .3rem;">
          <a class="path" style="font-size:1.25rem;padding:.6rem 1.2rem;display:inline-block;"
             href="https://finance-pv.vercel.app">finance-pv.vercel.app</a>
        </p>
        <p class="figcap" style="text-align:center;">Open it in any browser, on a phone or a
        computer. Bookmark it the first time and you will not have to type it again.</p>

        <figure class="shot">
          <div class="bar">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            <span class="url">finance-pv.vercel.app/login</span>
          </div>
          <img data-img="01-sign-in.png" src="img/01-sign-in.png"
               alt="The sign-in screen: a blue tile above the words LCM Finance and Human Resource System,
                    then a card headed Sign in to continue with a blue Sign in with Google
                    button, the word or, and an outlined Sign in with email link button.">
        </figure>
        <p class="figcap">This is what you will see.</p>

        <ol class="steps">
          <li><b>Press <em>Sign in with Google</em>.</b><span class="note">One tap, the same as
          opening your church email. Nothing to type.</span></li>
          <li><b>Use your <strong>@lcm.org.my</strong> Google account.</b><span class="note">That
          is the address the church knows you by, and the one your approvals are recorded
          against.</span></li>
        </ol>

        <div class="note-box">
          <p><b>No @lcm.org.my address?</b> Contact the LCM team and they will grant access to the
          personal email address you prefer to sign in with. This is usually the case for
          volunteers, who serve the church without being employed by it. Once they have granted
          it, sign in with Google using that address.</p>
        </div>

        <h3 id="first-time">If the app looks emptier than this guide describes</h3>
        <p>Your role has not been set yet. Signing in gets you through the door; what you may do
        once inside is recorded by the HQ office, usually the same day. Ask them to set it, then
        sign in again.</p>
    """),

    dict(rank=0, id="finding-your-way", title="Finding your way", roles=EVERYONE, body="""
        <p class="lede">Everything is reached from the list down the left. On a phone it is
        behind the menu button at the top.</p>

        <p>The few things you do most often sit at the top of that list, not nested inside
        anything, so they are one tap from wherever you are. Everything else is grouped:
        open a group and its pages appear underneath it.</p>

        <figure class="shot">
          <img data-img="10-sidebar.png" src="img/10-sidebar.png"
               alt="The left-hand list, showing the pinned entries at the top and the
                    collapsible groups beneath them.">
        </figure>
        <p class="figcap">You will not see every group in this picture. The list is built
        from what your role may do, so what is missing is simply not yours.</p>

        <div class="note-box">
          <p><b>Your name is at the foot of that list</b>, with your role under it. If the
          role shown there is wrong, nothing else in the app will behave the way this guide
          describes &mdash; check it first, and ask the HQ office to correct it.</p>
        </div>
    """),

    dict(rank=2, id="claiming", title="Claiming money back", roles=EVERYONE, body="""
        <p class="lede">Anyone can be owed money by the church &mdash; a volunteer who bought
        refreshments, a pastor who paid for petrol. Claiming is not something only staff may
        do, so <b>Submit PV</b> is in everybody&rsquo;s list.</p>

        <ol class="steps">
          <li><b>Open Submit PV</b>, at the top of the left-hand list.</li>
          <li><b>Say which ministry it belongs to.</b> This is the field people get wrong. It
          decides whose budget the money comes out of and who has to verify it, so if you are
          unsure, ask that ministry&rsquo;s EXCO Member before you send it.</li>
          <li><b>Say what it is for</b>, in a few plain words. &ldquo;Petrol, Orang Asli
          outreach, 12&ndash;14 Sept&rdquo; is a good purpose. &ldquo;Claim&rdquo; is not.</li>
          <li><b>Add each item and its amount.</b> The total adds itself &mdash; do not type it.</li>
          <li><b>Attach the receipts.</b> Photograph them with your phone; the form takes
          pictures as readily as files. A claim without receipts comes back to you.</li>
          <li><b>Say how you want to be paid</b>, and check the account number twice. That is
          the figure hardest to put right once the money has gone.</li>
          <li><b>Sign at the bottom</b> with your finger or your mouse, and send it.</li>
        </ol>

        <figure class="shot">
          <img data-img="03-request-desktop.png" src="img/03-request-desktop.png"
               alt="The payment request form on a computer, showing the ministry, purpose,
                    line items, attachments and payment details.">
        </figure>
        <p class="figcap">The form on a computer. On a phone it becomes one column with the
        same fields in the same order &mdash; nothing is left out of the small version.</p>

        <h3 id="claim-after">What happens after you send it</h3>
        <p>You do not have to chase it. The claim goes to the ministry&rsquo;s EXCO Member,
        then to Finance, then to the General Manager, then to the officers who sign. You can
        see where it has reached at any time under <b>My Submissions</b>, and whoever it is
        waiting on is named there.</p>

        <div class="note-box">
          <p><b>You will be told, not left wondering.</b> Each step emails you as it happens.
          If a claim is sent back, the reason is on it &mdash; correct that one thing and send
          it again rather than starting afresh.</p>
        </div>
    """),

    dict(rank=2, id="directory", title="The church directory", roles=EVERYONE, body="""
        <p class="lede">Who the pastors are, which congregation sits in which district, and
        who currently holds each office.</p>

        <p>Open <b>The Church</b> in the left-hand list, then <b>Church Directory</b> for the
        districts and congregations, or <b>Elected Offices</b> for who holds what. Both are
        there to be read; neither asks anything of you.</p>

        <div class="note-box">
          <p><b>Something out of date?</b> Tell the HQ office rather than working around it.
          The directory is what the app uses to decide who approves your leave and where a
          claim is routed, so a wrong entry there quietly sends things to the wrong person.</p>
        </div>
    """),

    dict(rank=2, id="leave-apply", title="Applying for leave", roles=EMPLOYED, body="""
        <p class="lede">Open <b>My Space</b> &rarr; <b>My Leave</b>. Your balance is on the
        first tab; applying is on the second.</p>

        <ol class="steps">
          <li><b>Check the balance first.</b> It shows what you are entitled to this year,
          what you have taken and what is left, for each kind of leave.</li>
          <li><b>Choose the kind of leave</b> and the dates. The number of days works itself
          out; you do not count them.</li>
          <li><b>Say why</b>, briefly. For medical leave, attach the certificate.</li>
          <li><b>Sign at the bottom</b> and send it.</li>
        </ol>

        <figure class="shot">
          <img data-img="05-my-leave.png" src="img/05-my-leave.png"
               alt="My Leave, showing the balance for each kind of leave this year.">
        </figure>
        <p class="figcap">Everyone in this picture is invented. Your own balances are
        private to you and to those who approve your leave.</p>

        <h3 id="leave-chain">Who has to sign</h3>
        <p>The form tells you before you send it, and the application tells you afterwards
        how far it has got &mdash; who has signed, and who it is now waiting on.</p>

        <div class="note-box">
          <p><b>Annual leave is asked for seven days ahead.</b> That is the church&rsquo;s
          rule, not the app&rsquo;s; it will let you apply later than that, and the person
          approving it will see that you did.</p>
        </div>
    """),

    dict(rank=2, id="payslip", title="Your payslip", roles=EMPLOYED, body="""
        <p class="lede"><b>My Space</b> &rarr; <b>My Salary</b>. Every month the church has
        paid you, with the payslip for each.</p>

        <p>Open a month to see what made it up &mdash; basic pay, allowances, EPF, SOCSO and
        the rest &mdash; and download the payslip as a PDF if you need it for a bank or a
        landlord.</p>

        <div class="note-box">
          <p><b>Only you see this.</b> Your pay is not visible to your EXCO Member, to the
          signing officers, or to anyone else who happens to be senior to you. If a figure
          looks wrong, the Finance Executive is the person to ask.</p>
        </div>
    """),

    dict(rank=1, id="exco-verify", title="Verifying your ministry&rsquo;s claims",
         roles=["exco"], body="""
        <p class="lede">Nothing is paid in your ministry&rsquo;s name without you saying the
        spending was real and was yours. That is what verifying means, and it is the step
        the whole chain rests on.</p>

        <p>Open <b>Approvals</b> &rarr; <b>EXCO Queue</b>. What is waiting on you is listed;
        anything already dealt with is not.</p>

        <ol class="steps">
          <li><b>Read the purpose and open the receipts.</b> You are confirming two things:
          that this spending happened, and that it belongs to your ministry.</li>
          <li><b>Look at the budget line.</b> The voucher says which line of your budget it
          comes out of and what is left of that line. If it says <b>Unbudgeted</b>, the
          spending is outside what was approved &mdash; that is not a refusal, but it is a
          question worth asking before you verify.</li>
          <li><b>Verify, or send it back with a reason.</b> A reason is not optional when you
          send something back: it is what the person is given to correct.</li>
        </ol>

        <div class="note-box">
          <p><b>You are not checking the arithmetic.</b> Finance does that afterwards, and the
          General Manager looks again after them. Your question is narrower and only you can
          answer it: <em>is this ours, and did it happen?</em></p>
        </div>

        <h3 id="exco-checker">Appointing a checker</h3>
        <p>If somebody else collects the receipts and raises the claims &mdash; a coordinator
        on the ground, say &mdash; you can appoint them as your <b>checker</b>. They confirm
        the particulars are right before the voucher reaches you, and you still verify it.</p>
        <p>You appoint them on the same EXCO Queue page. The person you choose must hold no
        portfolio of their own; the app will not let you appoint somebody who does, because
        a checker who could also verify would be checking their own work.</p>
    """),

    dict(rank=1, id="checker-check", title="Checking a voucher", roles=["checker"], body="""
        <p class="lede">An EXCO Member has asked you to confirm that the particulars on their
        ministry&rsquo;s vouchers are right, before they verify them.</p>

        <p>Open <b>Approvals</b> &rarr; <b>EXCO Queue</b>. Vouchers waiting for your check are
        listed there.</p>

        <ol class="steps">
          <li><b>Open the receipts</b> and compare them with the amounts claimed.</li>
          <li><b>Check the purpose describes what actually happened</b> &mdash; the date, the
          event, the people it was for.</li>
          <li><b>Confirm the check</b>, or send it back with a reason saying what does not
          match.</li>
        </ol>

        <div class="note-box">
          <p><b>Your check is not the approval.</b> Once you are satisfied, the voucher goes
          to the EXCO Member to verify, and on from there. You are confirming the particulars
          are accurate, not authorising the payment &mdash; unless your EXCO Member has
          delegated a specific budget line to you, in which case your check settles that line
          outright and the voucher moves straight on.</p>
        </div>

        <p>A voucher you raised yourself counts as checked when you send it: you cannot check
        your own work, so it goes to the EXCO Member to verify as normal.</p>
    """),

    dict(rank=1, id="approve-claims", title="Signing a voucher", roles=["signatory"], body="""
        <p class="lede">Open <b>Approve Vouchers</b>, at the top of the left-hand list. What
        is there is waiting on your signature and nothing else.</p>

        <p>You will not see a voucher that is still with the ministry, with Finance or with
        the General Manager. By the time one reaches you it has been verified by the EXCO,
        reviewed by Finance and approved by the General Manager &mdash; and the voucher itself
        shows you each of those, with the name and the date.</p>

        <figure class="shot">
          <img data-img="11-signatory-queue.png" src="img/11-signatory-queue.png"
               alt="Approve Vouchers: an approval path across the top showing Finance and
                    EXCO ticked and the Treasurer current, then tabs for Needs your
                    signature, Approved, Paid and Rejected, and voucher cards each with a
                    ministry, payee, purpose, amount, budget chip and Approve and Reject
                    buttons.">
        </figure>
        <p class="figcap">Four tabs, each with a count. The band across the top says how far
        a voucher has come and what is left &mdash; here, step 3 of 4. Everyone in this
        picture is invented.</p>

        <ol class="steps">
          <li><b>Read the purpose and the amount</b>, and open the receipts with the
          <b>Docs</b> button if you want to see them.</li>
          <li><b>Check the budget.</b> The green or amber chip says whether it fits &mdash;
          <em>tap it</em> and it opens, naming the exact budget line and showing what is
          approved, what is spent, what is committed and what would be left if you sign.</li>
          <li><b>Approve or reject.</b> Both ask for your PIN. A rejection asks for a reason,
          which goes back to whoever raised it.</li>
        </ol>

        <h3 id="how-many">How many signatures</h3>
        <p>Up to RM30,000 the Treasurer alone is enough. Above that it takes two officers,
        any two of the Bishop, the Secretary and the Treasurer. The voucher tells you which
        it is and how many signatures it already has.</p>

        <div class="note-box">
          <p><b>Nobody signs their own payment.</b> If a voucher pays you, or you were the one
          who raised it, the app will not offer you the buttons &mdash; another officer signs
          it instead. That is not a fault.</p>
        </div>

        <h3 id="pin">Your PIN</h3>
        <p>Signing asks for a four-digit PIN that is yours alone. Set it, or change it, from
        <b>Change my PIN</b> at the top right of the same page. It is deliberately separate
        from how you sign in: signing in says who you are, and the PIN says you meant it.</p>
    """),

    dict(rank=1, id="gm-verify", title="Approving a payment", roles=["gm"], body="""
        <p class="lede">Open <b>Approve Vouchers</b>. The first tab, <b>Needs your
        approval</b>, is what the ministry has verified and Finance has reviewed, now waiting
        on you.</p>

        <ol class="steps">
          <li><b>Read what it is for</b>, and open the receipts if the purpose does not settle
          it.</li>
          <li><b>Check the budget line.</b> Tap the budget chip to see the line it comes out
          of, what remains on it, and what would be left after this payment.</li>
          <li><b>Approve, and it goes to the signing officers.</b> Reject, and it goes back
          with your reason.</li>
        </ol>

        <p>The second tab, <b>With the signatories</b>, is what you have already approved and
        which is now waiting on the Bishop, Treasurer or Secretary. It is there so you can
        answer &ldquo;where is my claim?&rdquo; without asking anybody.</p>

        <h3 id="gm-claims">Claims brought to you directly</h3>
        <p>When somebody brings you a claim outside the system &mdash; a letter, a
        conversation, an invoice handed over &mdash; record it under <b>Approvals</b> &rarr;
        <b>GM Claims</b>. Finance picks it up from there and raises the voucher, and the trail
        starts from your instruction rather than from nothing.</p>
    """),

    dict(rank=1, id="leave-approve", title="Approving leave",
         roles=["gm", "signatory", "pastor"], body="""
        <p class="lede">Open <b>Approve Leave</b>, at the top of the left-hand list. What is
        waiting on you is at the top; what is waiting on somebody else is below it, so you
        can see where an application has got to without it being your turn.</p>

        <figure class="shot">
          <img data-img="07-leave-queue.png" src="img/07-leave-queue.png"
               alt="The leave queue, listing applications with the applicant, the dates and
                    who has signed so far.">
        </figure>
        <p class="figcap">The queue an approver sees. Everyone in this picture is invented.</p>

        <ol class="steps">
          <li><b>Open the application.</b> It shows the dates, the reason, the balance the
          person had when they applied, and the chain of who must sign.</li>
          <li><b>Sign it</b> &mdash; with your finger or your mouse &mdash; or reject it with
          a reason.</li>
        </ol>

        <h3 id="leave-order">The order matters</h3>
        <p>Leave is signed in order, not all at once. Office staff go to the General Manager
        first and then to the Bishop; a pastor goes to their Pastor in Charge and then the
        Dean; a head pastor to the Dean and then the Bishop; a Dean to the Bishop alone.</p>
        <p>If it is not your turn yet the application will say so and the buttons will not be
        there. Nothing is lost &mdash; you will be emailed when it reaches you.</p>

        <div class="note-box">
          <p><b>Nobody approves their own leave</b>, whatever office they hold. The chain
          skips you and goes to the person above.</p>
        </div>
    """),

    dict(rank=1, id="budget", title="The budget",
         roles=["exco", "gm", "signatory", "finance", "admin"], body="""
        <p class="lede">Open <b>Budget</b>. You see the ministries you are entitled to see
        &mdash; your own, or all of them.</p>

        <p>Each ministry&rsquo;s budget is a list of lines, one per project or activity. For
        each line: what was approved, what has been spent, what is committed but not yet paid,
        and what is left. The colour is a quick read &mdash; green has room, amber is close,
        red is over.</p>

        <figure class="shot">
          <img data-img="12-budget.png" src="img/12-budget.png"
               alt="A ministry budget: one row per project with columns for budget, spent,
                    committed, balance and available, and a total line. One project shows a
                    negative available balance in red.">
        </figure>
        <p class="figcap">One row per project. <b>Balance</b> ignores what is committed;
        <b>Available</b> subtracts it, which is the figure to use when deciding whether there
        is room for something new. Church planting here has RM1,250 left on paper and is
        RM550 short once the voucher already in the chain is counted. Every figure in this
        picture is invented.</p>

        <div class="note-box">
          <p><b>A voucher is tied to a budget line by its project name.</b> That is why the
          ministry and project on a claim matter: a claim with no project is spending the
          budget cannot see, and it will show as <b>Unbudgeted</b> wherever it appears.</p>
        </div>
    """),

    dict(rank=1, id="budget-propose", title="Proposing and amending a budget",
         roles=["exco"], body="""
        <p class="lede">Each year your ministry proposes what it expects to spend. During the
        year, if something changes, you ask for an amendment rather than quietly overspending.</p>

        <h3 id="budget-new">Proposing</h3>
        <ol class="steps">
          <li><b>Open Budget</b> and choose your ministry and the year.</li>
          <li><b>Add a line for each project or activity</b>, with what you expect it to cost
          and anything you expect it to bring in. Give each one a name you will recognise on a
          voucher a year from now &mdash; that name is how spending finds its way back to this
          line.</li>
          <li><b>Attach the papers</b> behind any line that needs explaining.</li>
          <li><b>Submit it.</b> It goes forward as a whole, to be decided by the EXCO at the
          meeting held for the budget. You will be told when it is approved or sent back.</li>
        </ol>

        <div class="note-box">
          <p><b>The budget is settled in a meeting, not in the app.</b> The EXCO votes on the
          year&rsquo;s budget at a meeting called for that and nothing else, and you have a voice
          in it like every other member. What is entered afterwards records what was resolved
          &mdash; which is why your proposal needs to be in before the meeting, not after.</p>
        </div>

        <h3 id="budget-amend">Amending one during the year</h3>
        <p>On the same page, ask for a change to a line &mdash; more, less, or a new line
        altogether &mdash; and say why. It goes forward the same way. The figures on the page do
        not move until the change has been agreed and recorded, which is deliberate: what you see
        is always what was actually decided.</p>

        <div class="note-box">
          <p><b>An unbudgeted claim is not refused automatically.</b> It is flagged to
          everybody who looks at it, including the officers who sign. If you know spending is
          coming that has no line, it is far easier to ask for the amendment first.</p>
        </div>
    """),

    dict(rank=1, id="budget-approve", title="Approving a budget",
         roles=["signatory", "gm"], body="""
        <p class="lede">The annual budget is not yours to approve on your own. It is decided by
        the EXCO, voting at a meeting called for that purpose and no other.</p>

        <p>Proposing and accepting the budget is the whole business of that meeting. The
        Treasurer, the Secretary and the Bishop each have a voice in it, and so does the rest of
        the EXCO. What happens in the app afterwards is the recording of what was resolved.</p>

        <div class="note-box">
          <p><b>What the button actually does.</b> Pressing <em>Approve</em> does not make the
          budget approved &mdash; the meeting did that. It puts the agreed figures live so claims
          can be charged against them. Press it after the meeting, not instead of one: approving
          beforehand would leave the app disagreeing with the minute book, and the minute book is
          the authority.</p>
        </div>

        <ol class="steps">
          <li><b>The EXCO meets and votes.</b><span class="note">A meeting for the budget alone, and the decision minuted.</span></li>
          <li><b>Open <span class="path">Budget</span>.</b><span class="note">Proposals from every ministry are listed together, so the meeting can work through them without going ministry by ministry.</span></li>
          <li><b>Record what was decided.</b><span class="note">Approving asks for the meeting&rsquo;s resolution and its date, and will not go through without them. It then makes the lines live. Sending one back unlocks it so the ministry can revise it before the next meeting, and your note is what they are given to work from.</span></li>
        </ol>

        <p>Once recorded, the resolution is shown beside the ministry and year at the head of the
        budget, so anybody reading the figures can see which meeting made them the budget.</p>

        <p>A change asked for mid-year works the same way and says what is being changed and why.
        Until it is recorded, the ministry&rsquo;s page keeps showing the figures that were
        actually agreed &mdash; a request does not quietly become a budget.</p>
    """),

    dict(rank=1, id="admin-records", title="Keeping the church&rsquo;s records",
         roles=["admin"], body="""
        <p class="lede">The directory, the congregations and the offices are yours. They are
        reference data the whole app depends on, and getting them right is quiet, important
        work.</p>

        <ul class="chips">
          <li><b>People Directory</b> &mdash; pastors, staff, volunteers, vendors. Names,
          addresses, congregations.</li>
          <li><b>Church Directory</b> &mdash; districts, the congregations in each, and who
          leads them.</li>
          <li><b>Offices &amp; Elections</b> &mdash; who holds which office, and from when.</li>
          <li><b>Official Registers</b> &mdash; the lists the church has to produce, as PDF or
          Excel.</li>
        </ul>

        <p>All four are under <b>Administration</b> in the left-hand list.</p>

        <div class="note-box">
          <p><b>Why this matters more than it looks.</b> Leave routing reads the directory to
          decide who approves whom. A pastor recorded against the wrong congregation has their
          leave sent to the wrong Dean, and nobody discovers it until the leave is late. When
          a record changes, change it here first.</p>
        </div>

        <p>None of the money is yours: not vouchers, not budgets, not payroll. That is
        deliberate, and it is why those pages are not in your list.</p>
    """),

    dict(rank=1, id="finance-review", title="Reviewing a voucher", roles=["finance"], body="""
        <p class="lede">Open <b>Payments</b> &rarr; <b>Finance Activity</b> for every voucher
        by stage, or work from the queue of what is waiting on you.</p>

        <ol class="steps">
          <li><b>Check the particulars</b> &mdash; receipts against amounts, the payee&rsquo;s
          bank details, the ministry and project.</li>
          <li><b>Give it the office reference and account code.</b> These are typed, not
          generated: the church&rsquo;s own filing decides them. The field suggests the next
          number in the series and tells you if one is already used or skipped, but it will
          not stop you &mdash; the suggestion is help, not a rule.</li>
          <li><b>Review it</b>, and it goes to the General Manager.</li>
        </ol>

        <h3 id="finance-gm-claims">Claims the General Manager has accepted</h3>
        <p><b>Approvals</b> &rarr; <b>GM Claims</b> holds what he has accepted outside the
        system and asked you to raise. Raising one from there carries his instruction onto the
        voucher, so the authority is attached rather than remembered.</p>

        <h3 id="finance-paid">Marking a payment made</h3>
        <p><b>Payments</b> &rarr; <b>Payments</b>, once the officers have signed. Record the
        date, the reference and the account it went from. A voucher cannot be marked paid
        before it is approved.</p>
    """),

    dict(rank=1, id="accounts-record", title="Recording payments", roles=["accounts"], body="""
        <p class="lede">Open <b>Payments</b> &rarr; <b>Payments</b>. Vouchers the officers
        have signed are waiting to be paid and recorded.</p>

        <ol class="steps">
          <li><b>Make the payment</b> through the bank as usual.</li>
          <li><b>Record it here</b> &mdash; the date, the reference, and which account it came
          from.</li>
          <li><b>Attach the receipt</b> from the bank if there is one.</li>
        </ol>

        <p>The reference series for each account is kept under <b>Administration</b> &rarr;
        <b>Payment References</b>: the prefix, how many digits, and where the numbering has
        reached.</p>

        <div class="note-box">
          <p><b>You record payments; you do not decide them.</b> Reviewing and approving
          vouchers belongs to the Finance Executive and to the officers who sign, and the
          app hides those controls from you rather than letting you press something that will
          be refused. It is a division of duty, not a comment on you.</p>
        </div>

        <h3 id="accounts-payroll">Payroll</h3>
        <p><b>Payroll</b> &rarr; <b>Payroll Runs</b>: build the month, check it, confirm it,
        and generate the vouchers that pay it. Payroll figures are confidential &mdash; they
        are visible to you because the work needs them, and to very few others.</p>
    """),

    dict(rank=1, id="building-bam", title="Building and event vouchers",
         roles=["building"], body="""
        <p class="lede">The property side has its own entries, under <b>Building &amp;
        Events</b> in the left-hand list.</p>

        <ul class="chips">
          <li><b>Submit BAM PV</b> &mdash; raise a building or event voucher.</li>
          <li><b>BAM Activity</b> &mdash; the ones you have raised, and where they have got to.</li>
          <li><b>BAM Recurring</b> &mdash; the ones that repeat, like utilities.</li>
          <li><b>Worksheets</b> &mdash; the workers, the hours and the wages.</li>
          <li><b>Facility Bookings</b> &mdash; who has the hall and when.</li>
          <li><b>Income Records</b> &mdash; what the facilities have brought in.</li>
        </ul>

        <p>A BAM voucher goes to the BAM Committee rather than to a ministry EXCO, and then
        follows the same path as any other: Finance, the General Manager, the signing
        officers.</p>
    """),

    dict(rank=3, id="help", title="If something is not right", roles=EVERYONE, body="""
        <p class="lede">Three things go wrong often enough to be worth saying plainly.</p>

        <h3 id="help-role">The app shows less than this guide describes</h3>
        <p>Your role is probably not set yet, or is set to the wrong one. Your name and role
        are at the foot of the left-hand list. Ask the HQ office to correct it, then sign in
        again.</p>

        <h3 id="help-saved">You pressed save and nothing happened</h3>
        <p>Tell somebody rather than pressing it again. A save that does not happen, with no
        error, usually means the record is not yours to change &mdash; and it is worth knowing
        about rather than working around.</p>

        <h3 id="help-stuck">Something has been waiting for days</h3>
        <p>Open it. Whatever it is waiting on is named on the item itself, with the step it
        has reached. For a payment request there is a <b>Remind</b> button that emails the
        person it is sitting with &mdash; use it rather than wondering.</p>

        <div class="note-box">
          <p><b>The whole system, in one document.</b> This guide covers your part of it. The
          full <b>LCM Finance &amp; HR Handbook</b> describes everything &mdash; every role, every
          stage, the rules behind the approval limits &mdash; and the HQ office can send it to
          you.</p>
        </div>
    """),
]
