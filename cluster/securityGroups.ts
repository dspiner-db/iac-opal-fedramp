import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import CECustomComponent from './default'
import CENetwork from '../network'

interface CEClusterSGArgs {
    network: CENetwork
    tags: {
        Project: string
        Owner: string
        Environment: string
        ProjectId: string
    }
}

export default class CEClusterSecurityGroups extends CECustomComponent {
    // controlPlane: aws.ec2.SecurityGroup
    node: aws.ec2.SecurityGroup
    cluster: aws.ec2.SecurityGroup
    // clusterIngressRule: aws.ec2.SecurityGroupRule
    rules: aws.ec2.SecurityGroupRule[]

    constructor(name: string, opts: CEClusterSGArgs, custom?: pulumi.CustomResourceOptions){
        super('corpeng:cluster:security-groups', name, { tags: opts.tags }, custom)
        this.tags = opts.tags

        let sgBaseName = `${name}-sg`
        let clusterSG_name = `${sgBaseName}-cluster`
        let controlPlaneSG_name = `${sgBaseName}-control-plane`
        let sharedNodeSG_name = `${sgBaseName}-shared-node-group`

        // this.controlPlane = new aws.ec2.SecurityGroup(clusterSG_name, {
        //     vpcId: opts.network.vpc.id,
        //     description: 'Cluster functionality',
        //     tags: this.getTags(clusterSG_name)
        // }, { parent: this })

        this.cluster = new aws.ec2.SecurityGroup(clusterSG_name, {
            vpcId: opts.network.vpc.id,
            description: 'Communication between the control plane and worker nodegroups',
            tags: this.getTags(clusterSG_name)
        }, { parent: this })

        this.node = new aws.ec2.SecurityGroup(sharedNodeSG_name, {
        vpcId: opts.network.vpc.id,
        description: 'Communication between all nodes in the cluster',
        tags: this.getTags(sharedNodeSG_name)
        }, { parent: this })

        // // Inbound from cluster
        // this.clusterIngressRule = new aws.ec2.SecurityGroupRule(`node-ingress-cluster`, {
        //     type: 'ingress',
        //     toPort: 0,
        //     protocol: 'all',
        //     fromPort: 0,
        //     securityGroupId: this.node.id,
        //     sourceSecurityGroupId: this.cluster.id
        // }, { parent: this.node }),

        this.rules = [

            // ------ CLUSTER ------ //
            // // Inbound from Self
            // new aws.ec2.SecurityGroupRule(`cluster-ingress-self`, {
            //     type: 'ingress',
            //     toPort: 0,
            //     protocol: 'all',
            //     fromPort: 0,
            //     securityGroupId: this.cluster.id,
            //     sourceSecurityGroupId: this.cluster.id
            // }, { parent: this.cluster }),

            // Inbound from Nodes
            new aws.ec2.SecurityGroupRule(`cluster-ingress-nodes`, {
                description: `Allow pods to communicate with the cluster API Server`,
                type: 'ingress',
                toPort: 443,
                protocol: 'https',
                fromPort: 443,
                securityGroupId: this.cluster.id,
                sourceSecurityGroupId: this.node.id
            }, { parent: this.cluster }),

            // All Outbound
            new aws.ec2.SecurityGroupRule(`cluster-egress-all`, {
                description: `Allow internet access.`,
                type: 'egress',
                toPort: 0,
                protocol: 'all',
                fromPort: 0,
                securityGroupId: this.cluster.id,
                cidrBlocks: [ "0.0.0.0/0" ]
            }, { parent: this.cluster }),

            // ------ CONTROL PLANE ------ //

            // Outbound All
            // new aws.ec2.SecurityGroupRule(`control-plane-egress-all`, {
            //     type: 'egress',
            //     toPort: 0,
            //     protocol: 'all',
            //     fromPort: 0,
            //     securityGroupId: this.controlPlane.id,
            //     cidrBlocks: [ "0.0.0.0/0" ]
            // }, { parent: this.controlPlane }),

            //Allow Nodes to Talk to Control Plane
            // new aws.ec2.SecurityGroupRule(`cluster-ingress-https-nodes`, {
            //     type: 'ingress',
            //     toPort: 443,
            //     protocol: 'tcp',
            //     fromPort: 443,
            //     securityGroupId: this.controlPlane.id,
            //     sourceSecurityGroupId: this.node.id
            // }, { parent: this.controlPlane }),
    
            // // Allow Control Plane to Talk to nodes
            // new aws.ec2.SecurityGroupRule(`cluster-egress-https-nodes`, {
            //     type: 'egress',
            //     toPort: 443,
            //     protocol: 'tcp',
            //     fromPort: 443,
            //     securityGroupId: this.controlPlane.id,
            //     sourceSecurityGroupId: this.node.id
            // }, { parent: this.controlPlane }),
    
            // // Allow Control Plane to Talk to nodes
            // new aws.ec2.SecurityGroupRule(`cluster-egress-k8-api-nodes`, {
            //     type: 'egress',
            //     toPort: 10250,
            //     protocol: 'tcp',
            //     fromPort: 10250,
            //     securityGroupId: this.controlPlane.id,
            //     sourceSecurityGroupId: this.node.id
            // }, { parent: this.controlPlane }),
    
            // ------ Nodes ------ //
            // Inbound from Self
            new aws.ec2.SecurityGroupRule(`node-ingress-self`, {
                description: `Allow nodes to communicate with each other`,
                type: 'ingress',
                toPort: 0,
                protocol: 'all',
                fromPort: 0,
                securityGroupId: this.node.id,
                sourceSecurityGroupId: this.node.id
            }, { parent: this.node }),

            new aws.ec2.SecurityGroupRule(`node-ingress-cluster`, {
                description: `Allow worker Kubelets and pods to receive communication from the cluster control plane`,
                type: 'ingress',
                protocol: 'tcp',
                toPort: 65535,
                fromPort: 1024,
                securityGroupId: this.node.id,
                sourceSecurityGroupId: this.cluster.id
            }, { parent: this.node }),

            new aws.ec2.SecurityGroupRule(`node-ingress-https-cluster`, {
                description: `Allow pods running extension API servers on port 443 to receive communication from cluster control plane`,
                type: 'ingress',
                protocol: 'tcp',
                toPort: 443,
                fromPort: 443,
                securityGroupId: this.node.id,
                sourceSecurityGroupId: this.cluster.id
            }, { parent: this.node }),

            // // Inbound from cluster
            // new aws.ec2.SecurityGroupRule(`node-ingress-cluster`, {
            //     type: 'ingress',
            //     toPort: 0,
            //     protocol: 'all',
            //     fromPort: 0,
            //     securityGroupId: this.node.id,
            //     sourceSecurityGroupId: this.cluster.id
            // }, { parent: this.node }),

            // Nodes Outbound
            new aws.ec2.SecurityGroupRule(`node-egress-all`, {
                type: 'egress',
                toPort: 0,
                protocol: 'all',
                fromPort: 0,
                securityGroupId: this.node.id,
                cidrBlocks: [ "0.0.0.0/0" ]
            }, { parent: this.node }),

            // // TCP: DNS -> Nodes
            // new aws.ec2.SecurityGroupRule(`node-ingress-tcp-dns`, {
            //     type: 'ingress',
            //     toPort: 53,
            //     protocol: 'tcp',
            //     fromPort: 53,
            //     securityGroupId: this.node.id,
            //     sourceSecurityGroupId: this.node.id
            // }, { parent: this.node }),
    
            // // TCP: Nodes -> DNS
            // new aws.ec2.SecurityGroupRule(`node-egress-tcp-dns`, {
            //     type: 'egress',
            //     toPort: 53,
            //     protocol: 'tcp',
            //     fromPort: 53,
            //     securityGroupId: this.node.id,
            //     sourceSecurityGroupId: this.node.id
            // }, { parent: this.node }),
    
            // // UDP: DNS -> Nodes
            // new aws.ec2.SecurityGroupRule(`node-ingress-udp-dns`, {
            //     type: 'ingress',
            //     toPort: 53,
            //     protocol: 'udp',
            //     fromPort: 53,
            //     securityGroupId: this.node.id,
            //     sourceSecurityGroupId: this.node.id
            // }, { parent: this.node }),
    
            // // UDP: Nodes -> DNS
            // new aws.ec2.SecurityGroupRule(`node-egress-udp-dns`, {
            //     type: 'egress',
            //     toPort: 53,
            //     protocol: 'udp',
            //     fromPort: 53,
            //     securityGroupId: this.node.id,
            //     sourceSecurityGroupId: this.node.id
            // }, { parent: this.node }),
    
            // // Nodes -> Control Plane
            // new aws.ec2.SecurityGroupRule(`node-egress-https-cluster`, {
            //     type: 'egress',
            //     protocol: 'tcp',
            //     toPort: 443,
            //     fromPort: 443,
            //     securityGroupId: this.node.id,
            //     sourceSecurityGroupId: this.node.id
            // }, { parent: this.node }),
    
            // // Cluster HTTPS -> Nodes
            // new aws.ec2.SecurityGroupRule(`node-ingress-https-cluster`, {
            //     type: 'ingress',
            //     protocol: 'tcp',
            //     toPort: 443,
            //     fromPort: 443,
            //     securityGroupId: this.node.id,
            //     sourceSecurityGroupId: this.controlPlane.id
            // }, { parent: this.node }),
    
            // // Cluster API -> Node
            // new aws.ec2.SecurityGroupRule(`node-ingress-cluster-api`, {
            //     type: 'ingress',
            //     protocol: 'tcp',
            //     toPort: 10250,
            //     fromPort: 10250,
            //     securityGroupId: this.node.id,
            //     sourceSecurityGroupId: this.controlPlane.id
            // }, { parent: this.node }),
    
            // // Cluster API -> Node
            // new aws.ec2.SecurityGroupRule(`node-egress-cluster-api`, {
            //     type: 'egress',
            //     protocol: 'tcp',
            //     toPort: 10250,
            //     fromPort: 10250,
            //     securityGroupId: this.node.id,
            //     sourceSecurityGroupId: this.controlPlane.id
            // }, { parent: this.node }),
    
            // // TCP: Nodes -> NTP
            // new aws.ec2.SecurityGroupRule(`node-egress-tcp-ntp`, {
            //     type: 'egress',
            //     protocol: 'tcp',
            //     toPort: 123,
            //     fromPort: 123,
            //     securityGroupId: this.node.id,
            //     cidrBlocks: ['0.0.0.0/0']
            // }, { parent: this.node }),
            // // UDP: Nodes -> NTP
            // new aws.ec2.SecurityGroupRule(`node-egress-udp-ntp`, {
            //     type: 'egress',
            //     protocol: 'udp',
            //     toPort: 123,
            //     fromPort: 123,
            //     securityGroupId: this.node.id,
            //     cidrBlocks: ['0.0.0.0/0']
            // }, { parent: this.node })
        ]
    
    }

}