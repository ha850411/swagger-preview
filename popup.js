const app = Vue.createApp({
    data() {
        return {
            tabLink: "",
        }
    },
    mounted() {
        this.preview();
    },
    watch: {
    },
    computed: {
    },
    methods: {
        preview: function() {
            this.getSelect();
        },
        getSelect: async function() {
            chrome.tabs.getSelected(null, function(tab) {
                vm.tabLink = tab.url;
                // vm.create();
                vm.update();
            });
        },
        create: function() {
            chrome.tabs.create({
                url: "https://petstore.swagger.io/?url=" + encodeURIComponent(this.tabLink)
            });
        },
        update: function() {
            chrome.tabs.update({
                url: "https://petstore.swagger.io/?url=" + encodeURIComponent(this.tabLink)
            });
        }
    },
});
const vm = app.mount('#app');    


