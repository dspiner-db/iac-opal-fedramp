import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from '@pulumi/eks'

import CENetwork from "../network";
// import CEClusterSecurityGroups from "./securityGroups";
import CEIAM from "./iam";

interface ClusterArgs {
    accountId: string
    network: CENetwork
    oidcProvider?: boolean
    tags: {
        Project: string
        Owner: string
        Environment: string
        ProjectId: string
    }
}

export default class CECluster extends pulumi.ComponentResource {
    name: string
    // securityGroups: CEClusterSecurityGroups
    iam: CEIAM
    tags: {
        Project: string
        Owner: string
        Environment: string
        ProjectId: string
    }

    eks: eks.Cluster
    
    constructor(name: string, opts: ClusterArgs, custom?: pulumi.CustomResourceOptions){
        super('corpeng:cluster', name, {}, custom)
        this.name = name
        this.tags = opts.tags

        let clusterKey_name = `${name}-cluster-key`
        const clusterKey = new aws.kms.Key(clusterKey_name,{
            description: "EKS Secret Encryption Key",
            deletionWindowInDays: 7,
            enableKeyRotation: true,
            tags: this.getTags(clusterKey_name)
        }, { parent: this })

        // this.securityGroups = new CEClusterSecurityGroups(`${name}-cluster`, {
        //     tags: this.tags,
        //     network: opts.network
        // }, { parent: this })

        this.iam = new CEIAM(`${name}-cluster-iam`, { tags: this.tags }, { parent: this })

            // Create the EKS Cluster
        let eksCluster_name = `${name}-eks-cluster`
        this.eks = new eks.Cluster(eksCluster_name, {
            name: eksCluster_name,
            vpcId: opts.network.vpc.id,
            version: '1.22',
            serviceRole: this.iam.clusterRole,
            instanceRole: this.iam.instanceRole,
            // clusterSecurityGroup: this.securityGroups.cluster,
            nodeGroupOptions: {
                // clusterIngressRule: this.securityGroups.clusterIngressRule,
                // nodeSecurityGroup: this.securityGroups.node,
                desiredCapacity: 2,
                minSize: 2,
                // nodeAssociatePublicIpAddress: true,
                instanceType: "m5.large"
            },
            kubernetesServiceIpAddressRange: '10.100.0.0/16',
            encryptionConfigKeyArn: clusterKey.arn,
            createOidcProvider: opts.oidcProvider || true,
            publicSubnetIds: opts.network.subnets.public.map(s => s.subnet.id),
            privateSubnetIds: opts.network.subnets.private.map(s => s.subnet.id),
            fargate: false
            
        }, { parent: this })

        
    }

    private getTags(Name: string): { [key: string]: string } {
        let temp: any = this.tags
        temp['Name'] = Name
        return temp
    }
}