<template>
    <div class='col col--12 grid pt12'>
        <template v-if='loading'>
            <div class='flex flex--center-main w-full py24'>
                <div class='loading'></div>
            </div>
        </template>
        <template v-else>
            <button @click='$router.go(-1)' class='btn round btn--stroke fl color-gray'>
                <svg class='icon'><use xlink:href='#icon-arrow-left'/></svg>
            </button>

            <h1 class='txt-h4 pl12' v-text='location.name'></h1>

            <div class='col col--12 pt12'>
                <Coverage
                    @err='$emit("err", $event)'
                    :filter='locid'
                    :bbox='location.bbox'
                />
            </div>

            <div :key='job.id' v-for='job in jobs' class='pl24 col col--12'>
                <div class='col col--12 grid py12 px12 cursor-pointer bg-darken10-on-hover round'>
                    <div @click='emitjob(job.job)' class='col col--5'>
                        <span v-text='job.layer'/> - <span v-text='job.name'/>

                    </div>
                    <div @click='emitjob(job.job)' class='col col--2'>
                        <span v-text='fmt(job.updated)'/>
                    </div>
                    <div class='col col--5'>
                        <Download :auth='auth' :job='job' @login='$emit("login")' @perk='$emit("perk", $event)'/>

                        <template v-if='auth && auth.access === "admin"'>
                            <span class='dropdown fr h24 cursor-pointer mx3 px12 round color-gray border border--transparent border--gray-on-hover'>
                                <SettingsIcon width='16' height='16'/>

                                <div class='round dropdown-content'>
                                    <label class='switch-container'>
                                        <input @change='updateData(job)' v-model='job.fabric' type='checkbox' />
                                        <div class='switch switch--blue mx6'></div>
                                        Fabric
                                    </label>
                                </div>
                            </span>
                        </template>

                        <span v-on:click.stop.prevent='emithistory(job.id)' class='fr h24 cursor-pointer mx3 px12 round color-gray border border--transparent border--gray-on-hover'>
                            <HistoryIcon width='16' height='16'/>
                        </span>

                        <span v-if='job.size > 0' class='fr mx6 bg-gray-faint color-gray inline-block px6 py3 round txt-xs txt-bold' v-text='size(job.size)'></span>
                    </div>
                </div>
            </div>
        </template>

        <div class='col col--12 py24 align-center'>
            OpenAddresses tracks free &amp; open data for <span v-text='location.name'/> including <span v-text='types.join(", ")'/>
        </div>
    </div>
</template>

<script>
import {
    HistoryIcon,
    SettingsIcon
} from 'vue-tabler-icons';
import Download from './Download.vue';
import Coverage from './Coverage.vue';
import moment from 'moment-timezone';

export default {
    name: 'Location',
    props: [ 'auth', 'locid' ],
    mounted: function() {
        this.refresh();
    },
    data: function() {
        return {
            tz: moment.tz.guess(),
            location: {},
            jobs: [],
            loading: false,
            types: []
        };
    },
    methods: {
        fmt: function(date) {
            return moment(date).tz(this.tz).format('YYYY-MM-DD');
        },
        emitjob: function(jobid) {
            this.$router.push({ path: `/job/${jobid}` });
        },
        emithistory: function(jobid) {
            this.$router.push({ path: `/data/${jobid}/history` })
        },
        size: function(bytes) {
            if (bytes == 0) { return "0.00 B"; }
            var e = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes/Math.pow(1024, e)).toFixed(2)+' '+' KMGTP'.charAt(e)+'B';
        },
        refresh: function() {
            this.getLocation();
            this.getJobs();
        },
        getLocation: async function() {
            try {
                this.loading = true;
                this.location = await window.std(window.location.origin + `/api/map/${this.locid}`);
                this.loading = false;
            } catch(err) {
                this.$emit('err', err);
            }
        },
        getJobs: async function() {
            try {
                this.jobs = await window.std(window.location.origin + `/api/data?map=${this.locid}`);
                this.types = this.jobs.map(j => j.layer).sort();
            } catch(err) {
                this.$emit('err', err);
            }
        }
    },
    components: {
        Download,
        Coverage,
        HistoryIcon,
        SettingsIcon
    },
}
</script>
