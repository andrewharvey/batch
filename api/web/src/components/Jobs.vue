<template>
    <div class='col col--12 grid pt12'>
        <div class='col col--12 grid border-b border--gray-light'>
            <div class='col col--12'>
                <h2 class='txt-h4 pb12 fl'>Jobs:</h2>

                <button @click='refresh' class='btn round btn--stroke fr color-gray'>
                    <svg class='icon'><use xlink:href='#icon-refresh'/></svg>
                </button>
            </div>

            <div class='col col--1'>
                Status
            </div>
            <div class='col col--2'>
                Job ID
            </div>
            <div class='col col--4'>
                Source
            </div>
            <div class='col col--5'>
                <span class='fr'>Attributes</span>
            </div>
        </div>

        <template v-if='loading'>
            <div class='flex flex--center-main w-full py24'>
                <div class='loading'></div>
            </div>
        </template>
        <template v-else>
            <div :key='job.id' v-for='job in jobs' class='col col--12 grid'>
                <div @click='emitjob(job.id)' class='col col--12 grid py12 cursor-pointer bg-darken10-on-hover round'>
                    <div class='col col--1'>
                        <Status :status='job.status'/>
                    </div>
                    <div class='col col--2'>
                        Job <span v-text='job.id'/>
                    </div>
                    <div class='col col--4'>
                        <span v-text='`${job.source_name} - ${job.layer} - ${job.name}`'/>
                    </div>
                    <div class='col col--5 pr12'>
                        <Download :auth='auth' :job='job' @login='$emit("login")' @perk='$emit("perk", $event)'/>

                        <span v-on:click.stop.prevent='external(job.source)' class='fr h24 cursor-pointer mx3 px12 round color-gray border border--transparent border--gray-on-hover'>
                            <BrandGithubIcon width="16" height="16"/>
                        </span>

                        <span v-on:click.stop.prevent='emitlog(job.id)' v-if='job.loglink' class='fr h24 cursor-pointer mx3 px12 round color-gray border border--transparent border--gray-on-hover'>
                            <NotesIcon width="16" height="16"/>
                        </span>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>

<script>
import {
    BrandGithubIcon,
    NotesIcon
} from 'vue-tabler-icons'
import Status from './Status.vue';
import Download from './Download.vue';

export default {
    name: 'Jobs',
    props: [ 'auth' ],
    mounted: function() {
        this.refresh();
    },
    data: function() {
        return {
            jobs: [],
            loading: false
        };
    },
    methods: {
        external: function(url) {
            window.open(url, "_blank");
        },
        emitlog: function(jobid) {
            this.$router.push({ path: `/job/${jobid}/log` });
        },
        emitjob: function(jobid) {
            this.$router.push({ path: `/job/${jobid}` });
        },
        refresh: function() {
            this.getJobs();
        },
        getJobs: async function() {
            try {
                this.loading = true;
                this.jobs = await window.std(window.location.origin + '/api/job');
                this.loading = false;
            } catch(err) {
                this.$emit('err', err);
            }
        }
    },
    components: {
        Download,
        Status,
        BrandGithubIcon,
        NotesIcon
    },
}
</script>
