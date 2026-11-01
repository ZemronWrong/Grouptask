# 📋 GroupTask End-to-End QA Test Guide

> **Scenario Objective:** Validate the new role-based task flow, permission locks, member self-actions ("Move to In Progress" & "Submit"), link proof submission, and the new sidebar Completed column layout.

---

## 👥 Setup & Roles Needed

Prepare test accounts (or open multiple browser windows / incognito sessions):
- 👑 **Owner Account** (Board Creator)
- 🛡️ **Co-Owner / Admin Account**
- 👤 **Member 1**
- 👤 **Member 2**
- 👤 **Member 3**

*All accounts should join the same board via the Board Invite Code.*

---

## 📑 TABLE OF CONTENTS / ROLE TABS

1. [Tab 1: 👑 OWNER GUIDE](#tab-1--owner-guide)
2. [Tab 2: 🛡️ CO-OWNER GUIDE](#tab-2-️-co-owner-guide)
3. [Tab 3: 👤 MEMBERS GUIDE (Member 1, 2, 3)](#tab-3--members-guide)
4. [Verification Checklist & Expected Results](#-verification-checklist)

---

## Tab 1: 👑 OWNER GUIDE

### Step 1: Create the Board from Scratch & Invite Team
1. Log in as **Owner** and go to the **Dashboard** (`#/`).
2. Click **"+ New Board"** (or **"Create Guild/Board"**).
3. In the modal:
   - Enter a Board Name: e.g. `2026 Movie & Food Squad`
   - Click **Create**.
4. The app will immediately create the board and redirect you to it (`#/group/<board-id>`).
5. **Get the Invite Code:**
   - In the board header, click the **"Share"** button.
   - Copy the **Invite Code** (e.g., `ABC12345`) or the copyable direct link.
6. **Have your team join:**
   - Share the code with **Co-Owner**, **Member 1**, **Member 2**, and **Member 3**.
   - As they join via their Dashboard (*"Join Board" -> Enter code -> "Join Directly"*):
7. **Promote the Co-Owner:**
   - In the **Share Modal** (or Members list), locate the Co-Owner's user entry.
   - Change their role dropdown from `Member` to `Co-Owner`.
   - Verify all 4 teammates are listed in the board.

---

### Step 2: Create the 3 Tasks for Members
1. On your newly created board, click **"+ Add Task"** to create Card 1:
   - **Title:** `List down movies`
   - **Assignee:** Select **Member 1**
   - **Difficulty:** Medium
   - **Points:** 50
   - **Task Type:** Feature
   - **Description:** Please list down 5 great movies to watch.
   - Click **Save**.
2. Click **"+ Add Task"** to create Card 2:
   - **Title:** `List down best food for 2026`
   - **Assignee:** Select **Member 2**
   - **Difficulty:** Hard
   - **Points:** 100
   - **Task Type:** Research
   - **Description:** Research and list trending food & dining spots for 2026.
   - Click **Save**.
3. Click **"+ Add Task"** to create Card 3:
   - **Title:** `List down best ice cream flavors`
   - **Assignee:** Select **Member 3**
   - **Difficulty:** Easy
   - **Points:** 30
   - **Task Type:** Bug / Task
   - **Description:** Pick your top 3 ice cream flavors.
   - Click **Save**.

### Step 3: Verify Board Layout & Permissions
- [ ] Confirm all 3 cards appear in the **"To Do"** column.
- [ ] As Owner, verify you see full admin controls (Edit, Delete, Assignee dropdown).
- [ ] Open any task modal: Verify you can edit **Points, Difficulty, Task Type, Description, and Assignee** freely (no locks).
- [ ] Notice the **"Completed"** section is positioned on the **right side panel** rather than taking up a regular board column.

### Step 4: Review & Approve Submissions
*(Once members perform their steps in Tab 3)*
1. When members submit, their cards will show **"Awaiting Approval"**.
2. Click on the card to open Task Details:
   - If submitted with a link, verify the clickable **🔗 Proof Link** is displayed.
   - Review the work submitted.
3. Click **"Approve & Complete"**:
   - The card should move into the **Completed Side Panel** on the right.
   - Points are credited to the assigned member.
4. *(Optional rejection test)*: On one card, click **"Reject"** with feedback:
   - Confirm card reverts to **"In Progress"** with a "Needs Revision" tag so the member can resubmit.

---

## Tab 2: 🛡️ CO-OWNER GUIDE

### Step 1: Join the Board & Verify Admin Privileges
1. Log in as **Co-Owner**.
2. From the **Dashboard** (`#/`), click **"Join Board"** (or use the direct invite link).
3. Enter the **Invite Code** provided by the Owner and click **"Join Directly"**.
4. Once the Owner has set your role to `Co-Owner`, enter the board (`#/group/<board-id>`).
5. **Verify full management permissions:**
   - Can edit any card's points, difficulty, and type.
   - Can delete or reassign cards.
6. Open any pending task submitted by a member:
   - Confirm the Co-Owner has the **"Approve & Complete"** and **"Reject"** buttons.

### Step 2: Test Co-Owner Task Workflow
1. Create a task assigned to yourself or pick an unassigned task.
2. Confirm you can move it through the stages just like a regular workflow while retaining admin oversight.

---

## Tab 3: 👤 MEMBERS GUIDE

> **Initial Setup for All 3 Members:**
> 1. Log in to each member account.
> 2. On the Dashboard, click **"Join Board"** (or open the direct link).
> 3. Enter the Owner's **Invite Code** and click **"Join Directly"**.
> 4. Open the board. You will see the board in **Member** mode.

---

### 🎬 Member 1: Testing "Move to In Progress" & Edit Restrictions
**Task:** `List down movies`

1. Log in as **Member 1** and open the board.
2. Locate your card **"List down movies"** in the **To Do** column.
3. **Verify Action Button:**
   - Look at the bottom of the card. You should see a button: **`▶ MOVE TO IN PROGRESS`**.
4. Click **`▶ MOVE TO IN PROGRESS`**:
   - Card automatically transitions to the **In Progress** column.
   - The button on the card now changes to **`🚀 SUBMIT`**.
5. **Test Edit Lockout:**
   - Click on the card to open the Detail Modal, then click **Edit**:
   - 🔒 **Verify:** A notice appears stating: *"As an assigned member, you can edit the description. Points, difficulty, and task type are locked by the team lead."*
   - Verify **Points**, **Difficulty**, and **Task Type** are disabled/locked.
   - Modify the **Description** (e.g., add: *"1. Interstellar 2. Inception 3. The Dark Knight"*).
   - Click **Save Changes**.
   - Verify the description updated successfully without breaking points or difficulty!

---

### 🍔 Member 2: Testing "Submit with Link"
**Task:** `List down best food for 2026`

1. Log in as **Member 2** and open the board.
2. Click **`▶ MOVE TO IN PROGRESS`** on your card.
3. Click the new **`🚀 SUBMIT`** button on your card:
   - A submission popup will appear with:
     - An input field for **Link / Proof URL**
     - A green button: **"🚀 Submit with Link"**
     - A subtle button: **"Proceed without a link"**
4. Paste a test URL into the field (e.g., `https://example.com/best-food-2026`).
5. Click **"🚀 Submit with Link"**:
   - The card status changes to **"Awaiting Approval"**.
   - Look at the card on the board:
     - A new row appears displaying: **`🔗 Link: https://example.com/...`** (clickable).
     - The card shows the **"Awaiting Approval"** badge.

---

### 🍦 Member 3: Testing "Proceed Without a Link"
**Task:** `List down best ice cream flavors`

1. Log in as **Member 3** and open the board.
2. Click **`▶ MOVE TO IN PROGRESS`** on your card.
3. Click **`🚀 SUBMIT`**.
4. Leave the link input blank.
5. Click **"Proceed without a link"**:
   - The modal closes immediately.
   - The card transitions to **"Awaiting Approval"**.
   - Verify **no empty link row** is shown on the card.

---

### 💬 Bonus: Test Comment Badge Popover
*(Any Member or Admin)*
1. Click on any card to view details.
2. Scroll to the **Comments** section.
3. Add a comment (e.g., *"Draft finished!"*).
4. Click on the **User Avatar / Badge Icon** next to the comment name.
5. **Verify:** A mini popover card opens showing that user's profile info and earned badges!

---

## 🔍 Verification Checklist

| Feature | Expected Behavior | Tested (Y/N) |
|---|---|:---:|
| **Owner Task Creation** | Owner can create 3 tasks with difficulty, points, type, & assignees | [ ] |
| **Move to In Progress** | Assigned member clicks `▶ MOVE TO IN PROGRESS` → moves card from To Do to In Progress | [ ] |
| **Member Edit Restriction** | Member can edit Title/Description, but Points, Difficulty, & Type are locked 🔒 | [ ] |
| **Submit with Link** | Member submits link → card displays clickable `🔗 Link` row & awaits approval | [ ] |
| **Submit without Link** | Member clicks "Proceed without a link" → submits directly without requiring URL | [ ] |
| **Admin Review** | Owner / Co-Owner sees pending approval and can Approve or Reject | [ ] |
| **Completed Side Panel** | Approved tasks appear in the dedicated right-hand Completed panel | [ ] |
| **Comment Badge Panel** | Clicking author badge/icon on comments displays mini profile & achievements | [ ] |
