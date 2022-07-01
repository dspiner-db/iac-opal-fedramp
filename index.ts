import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import axios from 'axios'
import { writeFileSync } from "fs";
import { randomUUID } from "crypto";

import CENetwork from "./network";
import CECluster from './cluster/index'
import CEClusterALB from './cluster/alb'
import OpalDB from './opal-db'


const CONFIG = new pulumi.Config()
const PROJECT_ID = CONFIG.get('projectId') || process.env.PROJECT_ID || randomUUID()
const STACK_NAME = pulumi.getStack()
const PROJECT_NAME = CONFIG.get('projectName') || pulumi.getProject()
const BASE_NAME = `${STACK_NAME}-${PROJECT_NAME}`
const CIDR = CONFIG.require('cidr')
const SUBNET_NETMASK = CONFIG.get('subnetNetmask') || "24"
const OWNER = CONFIG.require('owner')
const AWS_REGION = 'us-west-2'

async function main(){

    const identity = await aws.getCallerIdentity()

    // Get the Available Availability Zones
    const azs = await aws.getAvailabilityZones({
        state: "available"
    })

    const tags = {
        Project: PROJECT_NAME,
        Owner: OWNER,
        Environment: STACK_NAME,
        ProjectId: PROJECT_ID
    }
    const network = new CENetwork(`${BASE_NAME}/network`, {
        vpcCidr: CIDR,
        subnetMask: SUBNET_NETMASK,
        tags,
        azs
    })

    const cluster = new CECluster(`${BASE_NAME}`, {
        accountId: identity.accountId,
        oidcProvider: true,
        network,
        tags
    })

    if(cluster.eks && cluster.eks.core.oidcProvider){
        
        const db = new OpalDB(`${BASE_NAME}-db`, {
            network,
            nodeGroup: cluster.eks.nodeSecurityGroup,
            clusterGroup: cluster.eks.clusterSecurityGroup,
            port: 5432,
            tags
        })

        // Letest ALB Policy
        let r = await axios({
            method: 'GET',
            url: "https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.4.1/docs/install/iam_policy.json"
        })

        writeFileSync('./policies/alb_role.json', JSON.stringify(r.data))

        const clusterALB = new CEClusterALB(`${BASE_NAME}-alb`, {
            accountId: identity.accountId,
            vpcId: network.vpc.id,
            oidcUrl: cluster.eks.core.oidcProvider.url,
            cluster,
            tags
        }, { parent: cluster.eks })
    }

}

main()