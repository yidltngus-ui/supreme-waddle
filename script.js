(function(){
    "use strict";

    // Utilities
    const $ = (sel, root=document) => root.querySelector(sel);
    const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
    const formatDateKey = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const dd = String(d.getDate()).padStart(2,'0');
        return `${yyyy}-${mm}-${dd}`;
    };
    const parseDate = (key) => {
        const [y,m,d] = key.split('-').map(Number);
        return new Date(y, m-1, d);
    };

    // Storage
    const STORAGE_KEY = "pastel_todo_items_v1";
    const loadTodos = () => {
        try{ return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
        catch{ return []; }
    };
    const saveTodos = (todos) => localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));

    // State
    let todos = loadTodos();
    let currentViewMonth = new Date(); // month navigation base

    // Elements
    const form = $("#todo-form");
    const inputTitle = $("#todo-title");
    const inputDate = $("#todo-date");
    const clearBtn = $("#clear-btn");
    const listEl = $("#todo-list");
    const listCount = $("#list-count");
    const filterStatus = $("#filter-status");

    const tabList = $("#tab-list");
    const tabCalendar = $("#tab-calendar");
    const viewList = $("#list-view");
    const viewCalendar = $("#calendar-view");

    const monthTitle = $("#month-title");
    const calEl = $("#calendar");
    const prevMonthBtn = $("#prev-month");
    const nextMonthBtn = $("#next-month");

    // Accessibility live region
    const srLive = $("#sr-live");
    const announce = (msg) => { if(srLive){ srLive.textContent = msg; setTimeout(()=>srLive.textContent='', 1000);} };

    // Popover helpers for calendar chip actions
    let activePopover = null;
    const closePopover = () => {
        if(activePopover){
            activePopover.remove();
            activePopover = null;
        }
        document.removeEventListener('click', onDocClickClose, true);
        document.removeEventListener('keydown', onEscClose, true);
    };
    const onDocClickClose = (e) => {
        if(activePopover && !activePopover.contains(e.target)) closePopover();
    };
    const onEscClose = (e) => { if(e.key==='Escape') closePopover(); };
    const openPopoverForTask = (anchorEl, task) => {
        closePopover();
        const pop = document.createElement('div');
        pop.className = 'popover';
        pop.innerHTML = `
            <div class="menu">
                <button data-action="toggle">${task.done? '미완료로 표시' : '완료로 표시'}</button>
                <button data-action="edit">제목 수정</button>
                <button class="danger" data-action="delete">삭제</button>
            </div>
        `;
        document.body.appendChild(pop);
        const rect = anchorEl.getBoundingClientRect();
        const top = window.scrollY + rect.bottom + 6;
        const left = window.scrollX + Math.min(rect.left, window.innerWidth - pop.offsetWidth - 12);
        pop.style.top = `${top}px`;
        pop.style.left = `${left}px`;

        pop.addEventListener('click', (e)=>{
            const btn = e.target.closest('button');
            if(!btn) return;
            const action = btn.dataset.action;
            if(action==='toggle'){
                updateTodo(task.id, {done: !task.done});
                renderList();
                renderCalendar();
                closePopover();
            } else if(action==='edit'){
                const newTitle = prompt('할 일 수정', task.title);
                if(newTitle && newTitle.trim()){
                    updateTodo(task.id, {title:newTitle.trim()});
                    renderList();
                    renderCalendar();
                }
                closePopover();
            } else if(action==='delete'){
                deleteTodo(task.id);
                announce('달력에서 할 일을 삭제했습니다');
                renderList();
                renderCalendar();
                closePopover();
            }
        });

        activePopover = pop;
        // Delay to avoid immediate close from the same click
        setTimeout(()=>{
            document.addEventListener('click', onDocClickClose, true);
            document.addEventListener('keydown', onEscClose, true);
        }, 0);
    };

    // CRUD
    const createTodo = (title, dateKey) => ({
        id: crypto.randomUUID(),
        title,
        date: dateKey,
        done: false,
        createdAt: Date.now()
    });
    const addTodo = (todo) => { todos.push(todo); saveTodos(todos); };
    const updateTodo = (id, patch) => {
        const idx = todos.findIndex(t=>t.id===id);
        if(idx>-1){ todos[idx] = {...todos[idx], ...patch}; saveTodos(todos); }
    };
    const deleteTodo = (id) => { todos = todos.filter(t=>t.id!==id); saveTodos(todos); };

    // Rendering - List
    const renderList = () => {
        const status = filterStatus.value;
        const filtered = todos
            .slice()
            .sort((a,b)=> a.done-b.done || a.date.localeCompare(b.date) || a.createdAt-b.createdAt)
            .filter(t => status==='all' ? true : status==='open' ? !t.done : t.done);

        listEl.innerHTML = '';
        filtered.forEach(t => listEl.appendChild(renderListItem(t)));
        listCount.textContent = `총 ${filtered.length}개`;
    };
    const renderListItem = (t) => {
        const tpl = $("#todo-item-template");
        const node = tpl.content.firstElementChild.cloneNode(true);
        if(t.done) node.classList.add('done');
        node.dataset.id = t.id;
        const checkbox = $(".toggle", node);
        const title = $(".title", node);
        const meta = $(".meta", node);
        checkbox.checked = t.done;
        title.textContent = t.title;
        const d = parseDate(t.date);
        meta.textContent = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;

        checkbox.addEventListener('change', () => {
            updateTodo(t.id, {done: checkbox.checked});
            renderList();
            renderCalendar();
        });
        node.addEventListener('click', (e)=>{
            const btn = e.target.closest('button');
            if(!btn) return;
            const action = btn.dataset.action;
            if(action==='delete'){
                deleteTodo(t.id);
                announce('할 일을 삭제했습니다');
                renderList();
                renderCalendar();
            } else if(action==='edit'){
                const newTitle = prompt('할 일 수정', t.title);
                if(newTitle && newTitle.trim()){
                    updateTodo(t.id, {title:newTitle.trim()});
                    renderList();
                    renderCalendar();
                }
            }
        });
        return node;
    };

    // Rendering - Calendar
    const renderCalendar = () => {
        const base = new Date(currentViewMonth.getFullYear(), currentViewMonth.getMonth(), 1);
        const year = base.getFullYear();
        const month = base.getMonth();
        const startDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month+1, 0).getDate();

        monthTitle.textContent = `${year}년 ${month+1}월`;

        calEl.innerHTML = '';
        // Day names
        const dayNames = ['일','월','화','수','목','금','토'];
        dayNames.forEach(n => {
            const dn = document.createElement('div');
            dn.className = 'day-name';
            dn.textContent = n;
            calEl.appendChild(dn);
        });

        // Empty cells before 1st
        for(let i=0;i<startDay;i++){
            const empty = document.createElement('div');
            empty.className = 'cell';
            calEl.appendChild(empty);
        }

        const todayKey = formatDateKey(new Date());
        for(let d=1; d<=daysInMonth; d++){
            const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const cell = document.createElement('div');
            cell.className = 'cell' + (dateKey===todayKey ? ' today' : '');
            const dateEl = document.createElement('div'); dateEl.className='date'; dateEl.textContent = String(d);
            const tasksEl = document.createElement('div'); tasksEl.className='tasks';

            const inDay = todos
                .filter(t=>t.date===dateKey)
                .sort((a,b)=> a.done-b.done || a.createdAt-b.createdAt);

            inDay.slice(0,4).forEach(t=>{
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = `task-chip ${t.done?'done':'open'}`;
                chip.textContent = t.title;
                chip.setAttribute('title', '클릭하여 편집/삭제');
                chip.addEventListener('click', (e)=>{
                    e.stopPropagation();
                    openPopoverForTask(chip, t);
                });
                tasksEl.appendChild(chip);
            });
            if(inDay.length>4){
                const more = document.createElement('button');
                more.type = 'button';
                more.className = 'task-chip open';
                more.textContent = `+${inDay.length-4} 더보기`;
                more.addEventListener('click', (e)=>{
                    e.stopPropagation();
                    alert(inDay.map(x=>`${x.done?'[✓]':'[ ]'} ${x.title}`).join('\n'));
                });
                tasksEl.appendChild(more);
            }

            cell.appendChild(dateEl);
            cell.appendChild(tasksEl);
            calEl.appendChild(cell);
        }
    };

    // Tabs
    const activateTab = (tab) => {
        const isList = tab==="list";
        tabList.classList.toggle('active', isList);
        tabCalendar.classList.toggle('active', !isList);
        viewList.classList.toggle('active', isList);
        viewCalendar.classList.toggle('active', !isList);
    };

    tabList.addEventListener('click', ()=> activateTab('list'));
    tabCalendar.addEventListener('click', ()=> activateTab('calendar'));

    // Form events
    form.addEventListener('submit', (e)=>{
        e.preventDefault();
        const title = inputTitle.value.trim();
        const dateKey = inputDate.value;
        if(!title || !dateKey) return;
        const t = createTodo(title, dateKey);
        addTodo(t);
        inputTitle.value = '';
        announce('할 일을 추가했습니다');
        renderList();
        renderCalendar();
    });
    clearBtn.addEventListener('click', ()=>{ inputTitle.value=''; inputTitle.focus(); });
    filterStatus.addEventListener('change', renderList);

    prevMonthBtn.addEventListener('click', ()=>{ currentViewMonth = new Date(currentViewMonth.getFullYear(), currentViewMonth.getMonth()-1, 1); renderCalendar(); });
    nextMonthBtn.addEventListener('click', ()=>{ currentViewMonth = new Date(currentViewMonth.getFullYear(), currentViewMonth.getMonth()+1, 1); renderCalendar(); });

    // Init
    (function init(){
        // default date today
        inputDate.value = formatDateKey(new Date());
        renderList();
        renderCalendar();
        activateTab('list');
    })();
})();


