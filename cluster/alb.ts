import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from '@pulumi/kubernetes'
import { readFileSync, writeFileSync } from "fs";

import CECustomComponent from './default'

interface ClusterAlbArgs {
    accountId: string
    vpcId: pulumi.Output<string> | string
    oidcUrl: pulumi.Output<string>
    albRoleId?: string
    provider: k8s.Provider
    tags: {
        Project: string
        Owner: string
        Environment: string
        ProjectId: string
    }
}

export default class CEClusterALB extends CECustomComponent {
    role: aws.iam.Role
    serviceAccount: k8s.core.v1.ServiceAccount
    albChart: k8s.helm.v3.Chart

    constructor(name: string, opts: ClusterAlbArgs, custom?: pulumi.CustomResourceOptions){
        super('corpeng:cluster:alb', name, { tags: opts.tags }, custom)

        // Configure Roles for Worker Nodes
        let inlinePolicies: aws.types.input.iam.RoleInlinePolicy[] = []

        let albRole_name = `${this.name}-role-alb`
        let nameSpace = 'kube-system'
        let serviceAccount = 'aws-load-balancer-controller'
        let customArgs: pulumi.CustomResourceOptions = { parent: this }

        if(opts.albRoleId){ // ALB Role Already Created and Appropriate Policies are Attached
            customArgs = { import: opts.albRoleId, parent: this }
        }
        else { // Role and Policies need to be created
            inlinePolicies.push({ name: `alb-policy`, policy: readFileSync(`./policies/iam_policy.json`, { encoding: 'utf-8'}) })
        }


        opts.oidcUrl.apply( u => writeFileSync('./policies/alb_role.json', `{
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {
                        "Federated": "arn:aws:iam::${opts.accountId}:oidc-provider/${u}"
                    },
                    "Action": "sts:AssumeRoleWithWebIdentity",
                    "Condition": {
                        "StringEquals": {
                            "${u}:aud": "sts.amazonaws.com",
                            "${u}:sub": "system:serviceaccount:${nameSpace}:${serviceAccount}"
                        }
                    }
                }
            ]
        }`))
        
        this.role = new aws.iam.Role(albRole_name, {
            assumeRolePolicy: pulumi.interpolate `{
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {
                            "Federated": "arn:aws:iam::${opts.accountId}:oidc-provider/${opts.oidcUrl}"
                        },
                        "Action": "sts:AssumeRoleWithWebIdentity",
                        "Condition": {
                            "StringEquals": {
                                "${opts.oidcUrl}:aud": "sts.amazonaws.com",
                                "${opts.oidcUrl}:sub": "system:serviceaccount:${nameSpace}:${serviceAccount}"
                            }
                        }
                    }
                ]
            }`,
        inlinePolicies
        }, customArgs)

        // Create ALB K8s Service Account
        this.serviceAccount = new k8s.core.v1.ServiceAccount(`aws-load-balancer-controller-service-account`, {
            metadata: {
                labels: {
                    'app.kubernetes.io/component': 'controller',
                    'apply.kubernetes.io/name': 'aws-load-balancer-controller'
                },
                name: 'aws-load-balancer-controller',
                namespace: 'kube-system',
                annotations: {
                    'eks.amazonaws.com/role-arn': this.role.arn
                }  
            }

        } , { parent: this, provider: opts.provider })

        // Install ALB Controller
        this.albChart = new k8s.helm.v3.Chart(`load-balancer-controller`, {
            chart: `aws-load-balancer-controller`,
            namespace: 'kube-system',
            fetchOpts: {
                repo: "https://aws.github.io/eks-charts"
            },
            values: {
                serviceAccount: {
                    name: 'aws-load-balancer-controller',
                    create: false
                },
                clusterName: `${this.name}-eks-cluster`,
                vpcId: opts.vpcId
            },
        }, { parent: this, provider: opts.provider })

    }
}