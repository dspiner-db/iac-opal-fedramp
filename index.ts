import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { randomUUID } from "crypto";
import { SubnetCIDRAdviser, ICalculatorSubnet, calculate, getSubnetDetails } from 'subnet-cidr-calculator'

const CONFIG = new pulumi.Config()
const PROJECT_ID = CONFIG.get('projectId') || process.env.PROJECT_ID || randomUUID()
const STACK_NAME = pulumi.getStack()
const PROJECT_NAME = CONFIG.get('projectName') || pulumi.getProject()
const BASE_NAME = `${STACK_NAME}-${PROJECT_NAME}`
const CIDR = CONFIG.require('cidr')
const SUBNET_NETMASK = CONFIG.get('subnetNetmask') || 24
const OWNER = CONFIG.require('owner')
const AWS_REGION = 'us-west-2'

function createTags(Name: string){
    return {
        Project: PROJECT_NAME,
        Owner: OWNER,
        ClusterName: `${BASE_NAME}-cluster`,
        Environment: STACK_NAME,
        ProjectId: PROJECT_ID,
        Name
    }
}


function getSubnets(cidr: string, subnetNetmask: string): ICalculatorSubnet[] {
    // Get the Cidr in a format for for creating subnets
    let [vpcAddress, netmask] = cidr.split('/')

    // Define the subnet CIDRs based on vpc CIDR and subnetNetmask
    let details = getSubnetDetails(cidr)
    let r: ICalculatorSubnet[] = [ {
        value: `${details.startAddr}/${subnetNetmask}`,
        ipRange: {
            start: details.startAddr,
            end: details.endAddr
        },
        range: {
            from: 0,
            to: 0
        },
        isOverlap: false
    } ]
    let t = calculate(vpcAddress, netmask, [ cidr ])

    return r.concat(t.subnets.filter(s => s.value.includes(`/${subnetNetmask}`)))

}

async function BuildNetwork(isCluster: boolean): Promise<Network> {
    // Get the available subnets
    const vpcSubnets = getSubnets(CIDR, SUBNET_NETMASK.toString())

    // Get the Available Availability Zones
    const azs = await aws.getAvailabilityZones({
        state: "available"
    })

    // Create the VPC
    let vpc_name = `${BASE_NAME}/vpc`
    const vpc = new aws.ec2.Vpc(vpc_name, {
        cidrBlock: CIDR,
        enableDnsHostnames: true,
        tags: createTags(vpc_name)
    })

    // Create the containers the Public / Private Subnets will reside
    const publicSubnets: { subnet: aws.ec2.Subnet; az: string }[] = []
    const privateSubnets: { subnet: aws.ec2.Subnet; az: string }[] = []

    let subnetCounter = 0
    // Loop Through the Availability Zones
    azs.names.forEach((Az: string) => {
        let az = Az.split('-')[2]
        // Create the Base Name for All the subnets
        let subnetBaseName = `${BASE_NAME}/subnet`
        // Create a Unique Private Subnet Name
        let privateName = `${subnetBaseName}-private-${az}`
        // Create a Unique Public Subnet Name
        let publicName = `${subnetBaseName}-public-${az}`
        // Create the public Tags
        let publicTags = createTags(publicName)
        // Create the private Tags
        let privateTags = createTags(privateName)

        if(isCluster){
            // Setup Base Tag
            let tagA = `kubernetes.io/cluster/${BASE_NAME}`
            // Add private cluster tags
            privateTags[tagA as keyof typeof privateTags] = "shared"
            privateTags["kubernetes.io/role/internal-elb" as keyof typeof privateTags] = "1"
            // Add public cluster Tags
            publicTags[tagA as keyof typeof publicTags] = "shared"
            publicTags["kubernetes.io/role/elb" as keyof typeof publicTags] = "1"
        }

        // Create and Add the Private Subnet to container
        privateSubnets.push(
            {
                subnet: new aws.ec2.Subnet(privateName, {
                    vpcId: vpc.id,
                    cidrBlock: vpcSubnets[subnetCounter].value,
                    availabilityZone: Az,
                    tags: privateTags
                }),
                az
            }
        )
        subnetCounter ++

        // Create and Add the Private Subnet to container
        publicSubnets.push(
            {
                subnet: new aws.ec2.Subnet(publicName, {
                    vpcId: vpc.id,
                    cidrBlock: vpcSubnets[subnetCounter].value,
                    availabilityZone: Az,
                    tags: publicTags
                }),
                az
        })
        subnetCounter ++

    })

    // Create the Elastic IP for the Nat Gateway
    let natGatewayIP_name = `${BASE_NAME}/nat/eip`
    const natGatewayIP = new aws.ec2.Eip(natGatewayIP_name,{
        vpc: true,
        tags: createTags(natGatewayIP_name)
    })
    // Create the NatGateway
    let natGateway_name = `${BASE_NAME}/nat`
    const natGateway = new aws.ec2.NatGateway(natGateway_name, {
        subnetId: publicSubnets[0].subnet.id,
        allocationId: natGatewayIP.allocationId,
        tags: createTags(natGateway_name)
    })
    // Create the Internet Gateway
    let clusterIGW_name = `${BASE_NAME}/igw`
    const clusterIGW = new aws.ec2.InternetGateway(clusterIGW_name, {
        vpcId: vpc.id,
        tags: createTags(clusterIGW_name)
    })
    // Create Private Subnet Routing Tables & Associations
    privateSubnets.forEach((item) => {
        // Create Private Route Table
        let rt_name = `${BASE_NAME}/rt-private-${item.az}`
        let privateRT = new aws.ec2.RouteTable(rt_name, {
            vpcId: vpc.id,
            routes: [
                {
                    cidrBlock: '0.0.0.0/0',
                    natGatewayId: natGateway.id
                }
            ],
            tags: createTags(rt_name)
        })
        // Associate Route Table
        new aws.ec2.RouteTableAssociation(`${BASE_NAME}/rtacc-private-${item.az}`, {
            subnetId: item.subnet.id,
            routeTableId: privateRT.id
        })

    })

    // Create Public Route Table
    let publicRT_name = `${BASE_NAME}/rt-public`
    const publicRT = new aws.ec2.RouteTable(publicRT_name, {
        vpcId: vpc.id,
        routes: [
            {
                cidrBlock: '0.0.0.0/0',
                gatewayId: clusterIGW.id
            }
        ],
        tags: createTags(publicRT_name)
    })
    // Associate Public Subnets with Public Routing Table
    publicSubnets.forEach((item) => {
        new aws.ec2.RouteTableAssociation(`${BASE_NAME}/rtacc-public-${item.az}`, {
            subnetId: item.subnet.id,
            routeTableId: publicRT.id
        })
    })

    return {
        vpc,
        igw: clusterIGW,
        nat: natGateway,
        subnets: {
            public: publicSubnets,
            private: privateSubnets
        }
    }
}

export interface Network {
    vpc: aws.ec2.Vpc
    igw: aws.ec2.InternetGateway
    nat: aws.ec2.NatGateway
    subnets: {
        public: { subnet: aws.ec2.Subnet, az: string}[]
        private: { subnet: aws.ec2.Subnet, az: string}[]
    }
}

export interface AccessIAM {
    clusterRoleArn: string | pulumi.Output<string>
    securityGroups: {
        [key: string]: aws.ec2.SecurityGroup
    }
}
async function AccessIAM(accountId: string ,network: Network, clusterRoleArn?: aws.ARN, database?: { name: string, port: number }): Promise<AccessIAM> {

    let sgBaseName = `${BASE_NAME}/sg`
    let controlPlaneSG_name = `${sgBaseName}/control-plane`
    let sharedNodeSG_name = `${sgBaseName}/shared-node-group`

    let result: AccessIAM = {
        clusterRoleArn: "",
        securityGroups: {
            controlPlane: new aws.ec2.SecurityGroup(controlPlaneSG_name, {
                vpcId: network.vpc.id,
                description: 'Communication between the control plane and worker nodegroups',
                tags: createTags(controlPlaneSG_name)
            }),
            node: new aws.ec2.SecurityGroup(sharedNodeSG_name, {
                vpcId: network.vpc.id,
                description: 'Communication between all nodes in the cluster',
                tags: createTags(sharedNodeSG_name)
            })
        }
    }

    // ------ CONTROL PLANE ------ //
    //Allow Nodes to Talk to Control Plane
    new aws.ec2.SecurityGroupRule(`cluster-ingress-https-nodes`, {
        type: 'ingress',
        toPort: 443,
        protocol: 'tcp',
        fromPort: 443,
        securityGroupId: result.securityGroups.controlPlane.id,
        sourceSecurityGroupId: result.securityGroups.node.id
    })

    // Allow Control Plane to Talk to nodes
    new aws.ec2.SecurityGroupRule(`cluster-egress-https-nodes`, {
        type: 'egress',
        toPort: 443,
        protocol: 'tcp',
        fromPort: 443,
        securityGroupId: result.securityGroups.controlPlane.id,
        sourceSecurityGroupId: result.securityGroups.node.id
    })

    // Allow Control Plane to Talk to nodes
    new aws.ec2.SecurityGroupRule(`cluster-egress-k8-api-nodes`, {
        type: 'egress',
        toPort: 10250,
        protocol: 'tcp',
        fromPort: 10250,
        securityGroupId: result.securityGroups.controlPlane.id,
        sourceSecurityGroupId: result.securityGroups.node.id
    })

    // ------ Nodes ------ //

    // TCP: DNS -> Nodes
    new aws.ec2.SecurityGroupRule(`node-ingress-tcp-dns`, {
        type: 'ingress',
        toPort: 53,
        protocol: 'tcp',
        fromPort: 53,
        securityGroupId: result.securityGroups.node.id,
        sourceSecurityGroupId: result.securityGroups.node.id
    })

    // TCP: Nodes -> DNS
    new aws.ec2.SecurityGroupRule(`node-egress-tcp-dns`, {
        type: 'egress',
        toPort: 53,
        protocol: 'tcp',
        fromPort: 53,
        securityGroupId: result.securityGroups.node.id,
        sourceSecurityGroupId: result.securityGroups.node.id
    })

    // UDP: DNS -> Nodes
    new aws.ec2.SecurityGroupRule(`node-ingress-udp-dns`, {
        type: 'ingress',
        toPort: 53,
        protocol: 'udp',
        fromPort: 53,
        securityGroupId: result.securityGroups.node.id,
        sourceSecurityGroupId: result.securityGroups.node.id
    })

    // UDP: Nodes -> DNS
    new aws.ec2.SecurityGroupRule(`node-egress-udp-dns`, {
        type: 'egress',
        toPort: 53,
        protocol: 'udp',
        fromPort: 53,
        securityGroupId: result.securityGroups.node.id,
        sourceSecurityGroupId: result.securityGroups.node.id
    })

    // Nodes -> Control Plane
    new aws.ec2.SecurityGroupRule(`node-egress-https-cluster`, {
        type: 'egress',
        protocol: 'tcp',
        toPort: 443,
        fromPort: 443,
        securityGroupId: result.securityGroups.node.id,
        sourceSecurityGroupId: result.securityGroups.node.id
    })

    // Cluster HTTPS -> Nodes
    new aws.ec2.SecurityGroupRule(`node-ingress-https-cluster`, {
        type: 'ingress',
        protocol: 'tcp',
        toPort: 443,
        fromPort: 443,
        securityGroupId: result.securityGroups.node.id,
        sourceSecurityGroupId: result.securityGroups.controlPlane.id
    })

    // Cluster API -> Node
    new aws.ec2.SecurityGroupRule(`node-ingress-cluster-api`, {
        type: 'ingress',
        protocol: 'tcp',
        toPort: 10250,
        fromPort: 10250,
        securityGroupId: result.securityGroups.node.id,
        sourceSecurityGroupId: result.securityGroups.controlPlane.id
    })

    // TCP: Nodes -> NTP
    new aws.ec2.SecurityGroupRule(`node-egress-tcp-ntp`, {
        type: 'egress',
        protocol: 'tcp',
        toPort: 123,
        fromPort: 123,
        securityGroupId: result.securityGroups.node.id,
        cidrBlocks: ['0.0.0.0/0']
    })
    // UDP: Nodes -> NTP
    new aws.ec2.SecurityGroupRule(`node-egress-udp-ntp`, {
        type: 'egress',
        protocol: 'udp',
        toPort: 123,
        fromPort: 123,
        securityGroupId: result.securityGroups.node.id,
        cidrBlocks: ['0.0.0.0/0']
    })

    if(!clusterRoleArn){
        let clusterRole_name = `${BASE_NAME}-role-cluster-service`

        const clusterRole = new aws.iam.Role(clusterRole_name, {
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Principal: { 
                            Service: "eks.amazonaws.com"
                        },
                        Effect: "Allow"
                    }
                ]
            }),
            inlinePolicies: [
                {
                    name: `${BASE_NAME}-policy-elb`,
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [
                            {
                                Action: [
                                    "ec2:DescribeAccountAttributes",
                                    "ec2:DescribeAddress",
                                    "ec2:DescribeInternetGateways"
                                ],
                                Resource: "*",
                                Effect: "Allow"
                            }
                        ]
                    })
                },
                {
                    name: `${BASE_NAME}-policy-metrics`,
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [
                            {
                                Action: [
                                    "cloudwatch:PutMetricData",
                                ],
                                Resource: "*",
                                Effect: "Allow"
                            }
                        ]
                    })
                }
            ],
            managedPolicyArns: [ 
                `arn:aws:iam::aws:policy/AmazonEKSClusterPolicy`,
                `arn:aws:iam::aws:policy/AmazonEKSVPCResourceController`
            ],
            tags: createTags(clusterRole_name)
        })

        result.clusterRoleArn = clusterRole.arn
    }
    else{
        result.clusterRoleArn = clusterRoleArn
    }

    if(database){
        let dbSG_name = `${sgBaseName}/db`
        result.securityGroups['database' as keyof typeof result.securityGroups] = new aws.ec2.SecurityGroup(dbSG_name, {
            vpcId: network.vpc.id,
            description: `Communication between Database on EKS nodegroups`,
            ingress: [
                {
                    fromPort: database.port,
                    toPort: database.port,
                    protocol: 'tcp',
                    securityGroups: [ result.securityGroups.node.id ]
                }
            ],
            egress: [
                {
                    fromPort: database.port,
                    toPort: database.port,
                    protocol: 'tcp',
                    securityGroups: [ result.securityGroups.node.id ]
                }
            ],
            tags: createTags(dbSG_name)
        })

        // Database -> Nodes
        new aws.ec2.SecurityGroupRule(`node-ingress-database`, {
            type: 'ingress',
            protocol: 'tcp',
            toPort: database.port,
            fromPort: database.port,
            securityGroupId: result.securityGroups.node.id,
            sourceSecurityGroupId: result.securityGroups.database.id
        })

        // Nodes -> Database
        new aws.ec2.SecurityGroupRule(`node-egress-database`, {
            type: 'egress',
            protocol: 'tcp',
            toPort: database.port,
            fromPort: database.port,
            securityGroupId: result.securityGroups.node.id,
            sourceSecurityGroupId: result.securityGroups.database.id
        })

    }

    return result
    
}

async function CreateCluster(network: Network, iam: AccessIAM){

    let clusterKey_name = `${BASE_NAME}/key`
    const clusterKey = new aws.kms.Key(clusterKey_name,{
        description: "EKS Secret Encryption Key",
        deletionWindowInDays: 7,
        enableKeyRotation: true,
        tags: createTags(clusterKey_name)
    })

    let eksCluster_name = `${BASE_NAME}-eks-cluster`
    const eksCluster = new aws.eks.Cluster(eksCluster_name, {
        name:eksCluster_name,
        roleArn: iam.clusterRoleArn,
        version: "1.22",
        vpcConfig: {
            subnetIds: network.subnets.private.map(s => s.subnet.id),
            securityGroupIds: [ iam.securityGroups.controlPlane.id ],
            endpointPrivateAccess: true,
            endpointPublicAccess: true
        },
        enabledClusterLogTypes: ["api","audit","controllerManager"],
        encryptionConfig: {
            provider: {
                keyArn: clusterKey.arn
            },
            resources: ["secrets"]
            
        },
        tags: createTags(eksCluster_name)
        
    })

    return eksCluster

}

async function EC2Nodes(cluster: aws.eks.Cluster, iam: AccessIAM, network: Network){

    let nodeSuffix = PROJECT_ID.split('-')[0]
    let nodeGroupRole = new aws.iam.Role(`${BASE_NAME}-role-node-group`,{
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Principal: {
                        Service: "ec2.amazonaws.com"
                    },
                    Action: "sts:AssumeRole"
                }
            ]
        }),
        managedPolicyArns: [
            "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
            "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
            "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
            "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
        ],
        tags: createTags(`${BASE_NAME}-role-node-group`)
    })

    const launchTemplate = new aws.ec2.LaunchTemplate(`${BASE_NAME}-nodegroup-ng-${nodeSuffix}`, {
        vpcSecurityGroupIds: [ iam.securityGroups.node.id ],
        blockDeviceMappings: [
            {
                deviceName: "/dev/xvda",
                ebs: {
                    volumeSize: 80,
                    volumeType: 'gp3'
                }
            }
        ],
        tagSpecifications: [
            {
                resourceType: "instance",
                tags: {
                    'Name': `${BASE_NAME}-ng-${nodeSuffix}-Node`,
                    'nodegroup-name': `ng-${nodeSuffix}`,
                    'nodegroup-type': 'managed',
                    [`kubernetes.io/cluster/${BASE_NAME}`]: "owned",
                    'eks:nodegroup-name': `ng-${nodeSuffix}`
                }
            }
        ],
        tags: createTags(`${BASE_NAME}-lt`)
    })

    const clusterNodeGroup = new aws.eks.NodeGroup(`ng-${nodeSuffix}`, {
        clusterName: cluster.name,
        nodeRoleArn: nodeGroupRole.arn,
        subnetIds: network.subnets.private.map(s => s.subnet.id),
        scalingConfig: {
            desiredSize: 2,
            maxSize: 2,
            minSize: 2
        },
        amiType: 'AL2_x86_64',
        instanceTypes: [ 'm5.large' ],
        launchTemplate: {
            version: "$Latest",
            id: launchTemplate.id
        },
        capacityType: 'ON_DEMAND',
        labels: {
            'cluster-name': `${BASE_NAME}`,
            'nodegroup-name': `ng-${nodeSuffix}`
        },
        tags: createTags(`ng-${nodeSuffix}`)
    })



}

async function main(){

    const identity = await aws.getCallerIdentity()

    const network = await BuildNetwork(true)

    const IAM: AccessIAM = await AccessIAM(identity.accountId, network)

    const Cluster = await CreateCluster(network, IAM)

    const EC2 = await EC2Nodes(Cluster, IAM, network)


}

main()